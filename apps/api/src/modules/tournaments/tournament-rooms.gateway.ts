import { Injectable, type OnModuleInit, type OnModuleDestroy } from "@nestjs/common";
import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway, WebSocketServer, type OnGatewayInit } from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import { JwtTokenService } from "../auth/services/jwt-token.service.js";
import { UsersService } from "../users/services/users.service.js";
import { ApiRateLimiterService } from "../../common/rate-limiting/api-rate-limiter.service.js";
import { DotaTournamentRoomsService } from "./tournament-rooms.service.js";
import { TournamentRoomEvents } from "./tournament-room-events.js";
import { TournamentMatchChatService } from "./tournament-match-chat.service.js";

@Injectable()
@WebSocketGateway({ namespace: "/tournament-rooms" })
export class DotaTournamentRoomsGateway implements OnGatewayInit, OnModuleInit, OnModuleDestroy {
  @WebSocketServer() private server!: Server;
  private unsubscribe?: () => void;
  private unsubscribeMatches?: () => void;
  constructor(private readonly rooms: DotaTournamentRoomsService,
    private readonly jwt: JwtTokenService, private readonly users: UsersService,
    private readonly limiter: ApiRateLimiterService, private readonly events: TournamentRoomEvents,
    private readonly matchChat: TournamentMatchChatService) {}

  afterInit(server: Server) {
    server.use((client, next) => {
      void (async () => {
        const token = client.handshake.auth?.token;
        const verified = typeof token === "string" ? this.jwt.verifyAccessToken(token) : null;
        const user = verified ? await this.users.findAuthenticatedUserById(verified.userId) : null;
        if (!user || user.status !== "active") return next(new Error("Authentication required"));
        client.data.user = user;
        next();
      })().catch(() => next(new Error("Authentication failed")));
    });
  }
  onModuleInit() {
    // Notifications contain no chat content. Each refresh rechecks live membership.
    this.unsubscribe = this.events.subscribe((entryId) => {
      this.server?.to("tournament-entry:" + entryId).emit("changed", { entryId });
    });
    this.unsubscribeMatches = this.events.subscribeMatch((matchId) => {
      this.server?.to("tournament-match:" + matchId).emit("match_changed", { matchId });
    });
  }
  onModuleDestroy() { this.unsubscribe?.(); this.unsubscribeMatches?.(); }

  @SubscribeMessage("join_match")
  async joinMatch(@ConnectedSocket() client: Socket, @MessageBody() payload: { slug?: string; matchId?: string }) {
    if (!payload || typeof payload.slug !== "string" || payload.slug.length > 120 || typeof payload.matchId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.matchId)) return { ok: false };
    try {
      const user = client.data.user ? await this.users.findAuthenticatedUserById(client.data.user.id) : null;
      if (!user || user.status !== "active") return { ok: false };
      await this.limiter.assertWithinLimits([{ key: user.id, namespace: "tournament:match-chat:subscribe", limit: 30,
        windowSeconds: 60, message: "Too many subscriptions" }]);
      await this.matchChat.requireReader(payload.slug, payload.matchId, user);
      if (client.data.matchRoom) await client.leave(client.data.matchRoom);
      client.data.matchRoom = "tournament-match:" + payload.matchId;
      await client.join(client.data.matchRoom);
      return { ok: true };
    } catch { return { ok: false }; }
  }

  @SubscribeMessage("join")
  async join(@ConnectedSocket() client: Socket, @MessageBody() payload: { slug?: string; entryId?: string }) {
    if (!payload || typeof payload.slug !== "string" || payload.slug.length > 120 ||
      typeof payload.entryId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.entryId))
      return { ok: false };
    try {
      if (!client.data.user) return { ok: false };
      await this.limiter.assertWithinLimits([{
        key: client.data.user.id, namespace: "tournament:room:subscribe", limit: 30,
        windowSeconds: 60, message: "Too many room subscriptions"
      }]);
      await this.rooms.requireReader(payload.slug, payload.entryId, client.data.user);
      if (client.data.room) await client.leave(client.data.room);
      client.data.room = "tournament-entry:" + payload.entryId;
      await client.join(client.data.room);
      return { ok: true };
    } catch { return { ok: false }; }
  }
}

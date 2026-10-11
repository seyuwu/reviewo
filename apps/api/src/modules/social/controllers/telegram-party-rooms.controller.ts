import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { TelegramBotService } from "../../telegram/telegram-bot.service.js";
import { TelegramPartyRoomsService } from "../services/telegram-party-rooms.service.js";
import { PoolCapacityDto, RegisterRoomDto, ReserveRoomDto, RoomAdminActionDto, RoomAdminDto, RoomAdmissionDto,
  RoomBotDto, RoomDeletedDto, RoomDiscordDto, RoomLeaseDto, RoomMessagesDto, RoomPresenceDto, RoomReportDto } from "../dto/telegram-party-rooms.dto.js";

@Controller("social/telegram-party-rooms")
export class TelegramPartyRoomsController {
  constructor(private readonly telegram: TelegramBotService, private readonly rooms: TelegramPartyRoomsService) {}
  private authorize(secret?: string) { this.telegram.assertBotSecret(secret); }

  @Get("admin")
  list(@Query() input: RoomAdminDto, @Headers("x-telegram-bot-secret") secret?: string) {
    this.authorize(secret); return this.rooms.adminList(input.adminId);
  }
  @Post("admin/register")
  register(@Body() input: RegisterRoomDto, @Headers("x-telegram-bot-secret") secret?: string) {
    this.authorize(secret); return this.rooms.register(input);
  }
  @Post("admin/capacity")
  capacity(@Body() input: PoolCapacityDto, @Headers("x-telegram-bot-secret") secret?: string) {
    this.authorize(secret); return this.rooms.capacity(input.adminId, input.capacity);
  }
  @Post("admin/:id")
  action(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string, @Body() input: RoomAdminActionDto, @Headers("x-telegram-bot-secret") secret?: string) {
    this.authorize(secret); return this.rooms.adminAction(id, input.adminId, input.action, input.staffIds);
  }
  @Post("reserve")
  reserve(@Body() input: ReserveRoomDto, @Headers("x-telegram-bot-secret") secret?: string) {
    this.authorize(secret); return this.rooms.reserve(input.botId, input.userId, input.slug);
  }
  @Get("worker")
  worker(@Query() input: RoomBotDto, @Headers("x-telegram-bot-secret") secret?: string) {
    this.authorize(secret); return this.rooms.workerRooms(input.botId, input.lastPolledAt);
  }
  @Post("track")
  track(@Body() input: RoomMessagesDto, @Headers("x-telegram-bot-secret") secret?: string) {
    this.authorize(secret); return this.rooms.track(input);
  }
  @Get("notices")
  notices(@Query() input: RoomBotDto, @Headers("x-telegram-bot-secret") secret?: string) {
    this.authorize(secret); return this.rooms.notices();
  }
  @Post("presence")
  presence(@Body() input: RoomPresenceDto, @Headers("x-telegram-bot-secret") secret?: string) {
    this.authorize(secret); return this.rooms.presence(input.botId, input.chatId, input.userId, input.event, input.actorId,
      input.status, input.sentAt, input.updateId, input.wasPresent);
  }
  @Post(":id/claim")
  claim(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string, @Body() input: RoomBotDto, @Headers("x-telegram-bot-secret") secret?: string) {
    this.authorize(secret); return this.rooms.claim(id, input.botId);
  }
  @Post(":id/release")
  release(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string, @Body() input: RoomLeaseDto, @Headers("x-telegram-bot-secret") secret?: string) {
    this.authorize(secret); return this.rooms.release(id, input.botId, input.leaseToken);
  }
  @Post(":id/report")
  report(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string, @Body() input: RoomReportDto, @Headers("x-telegram-bot-secret") secret?: string) {
    this.authorize(secret); return this.rooms.report(id, input);
  }
  @Post(":id/admission")
  admission(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string, @Body() input: RoomAdmissionDto, @Headers("x-telegram-bot-secret") secret?: string) {
    this.authorize(secret); return this.rooms.admission(id, input.botId, input.userId, input.inviteLink);
  }
  @Post(":id/ready")
  ready(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string, @Body() input: RoomAdmissionDto, @Headers("x-telegram-bot-secret") secret?: string) {
    this.authorize(secret); return this.rooms.ready(id, input.botId, input.userId, input.ready ?? true, input.generation);
  }
  @Post(":id/eligible")
  eligible(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string, @Body() input: RoomAdmissionDto, @Headers("x-telegram-bot-secret") secret?: string) {
    this.authorize(secret); return this.rooms.eligible(id, input.botId, input.userId, input.generation);
  }
  @Get(":id/card")
  card(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string, @Query() input: RoomBotDto, @Headers("x-telegram-bot-secret") secret?: string) {
    this.authorize(secret); return this.rooms.card(id, input.botId);
  }
  @Post(":id/deletions")
  deletions(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string, @Body() input: RoomLeaseDto, @Headers("x-telegram-bot-secret") secret?: string) {
    this.authorize(secret); return this.rooms.deletions(id, input.botId, input.generation, input.leaseToken);
  }
  @Post(":id/deleted")
  deleted(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string, @Body() input: RoomDeletedDto, @Headers("x-telegram-bot-secret") secret?: string) {
    this.authorize(secret); return this.rooms.deleted(id, input.botId, input.generation, input.leaseToken, input.messageIds);
  }
  @Post(":id/discord")
  discord(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string, @Body() input: RoomDiscordDto,
    @Headers("x-telegram-bot-secret") secret?: string) {
    this.authorize(secret); return this.rooms.openDiscord(id, input.botId, input.userId, input.generation);
  }
}

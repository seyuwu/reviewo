import { HttpStatus, Injectable } from "@nestjs/common";

import { AppErrorCode } from "../../../common/exceptions/app-error-code.js";
import { createAppException } from "../../../common/exceptions/app.exception.js";
import type { AuthenticatedUser } from "../../../common/interfaces/authenticated-request.js";
import type { AdminPartiesPageDto, ListAdminPartiesQueryDto } from "../dto/admin-parties.dto.js";
import type { GamePartyChatMessagesPageDto } from "../dto/game-party-response.dto.js";
import { GamePartiesRepository } from "../repositories/game-parties.repository.js";

/** Read-only administration: no memberships, notifications or chat backfills. */
@Injectable()
export class AdminPartiesService {
  constructor(private readonly gamePartiesRepository: GamePartiesRepository) {}

  async listParties(
    actor: AuthenticatedUser,
    input: ListAdminPartiesQueryDto
  ): Promise<AdminPartiesPageDto> {
    this.assertAdmin(actor);
    const result = await this.gamePartiesRepository.listAdminActiveParties(input, new Date());
    return {
      items: result.items.map((party) => ({
        ...party,
        createdAt: party.createdAt.toISOString(),
        expiresAt: party.expiresAt?.toISOString() ?? null,
        members: party.members.map((member) => ({
          displayName: member.user.displayName,
          positionRole: member.positionRole,
          role: member.role,
          userId: member.userId
        }))
      })),
      nextCursor: result.nextCursor,
      total: result.total
    };
  }

  async listChatMessages(
    actor: AuthenticatedUser,
    partyId: string,
    before?: string,
    limit = 50
  ): Promise<GamePartyChatMessagesPageDto> {
    this.assertAdmin(actor);
    const party = await this.gamePartiesRepository.findById(partyId);
    if (
      !party ||
      party.vertical !== "dota" ||
      party.mergedIntoSlug ||
      (party.expiresAt !== null && party.expiresAt.getTime() <= Date.now())
    ) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Active party was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }
    const rows = await this.gamePartiesRepository.listChatMessages(party.id, before, limit);
    return {
      messages: [...rows].reverse().map((row) => ({
        createdAt: row.createdAt.toISOString(),
        displayName: row.user.displayName,
        id: row.id,
        message: row.message,
        userId: row.userId
      })),
      nextCursor: rows.length >= Math.min(limit, 100) ? (rows.at(-1)?.id ?? null) : null
    };
  }

  private assertAdmin(actor: AuthenticatedUser): void {
    if (actor.role !== "ADMIN") {
      throw createAppException({
        code: AppErrorCode.Forbidden,
        message: "Admin access required",
        statusCode: HttpStatus.FORBIDDEN
      });
    }
  }
}

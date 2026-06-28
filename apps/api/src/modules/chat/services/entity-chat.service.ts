import { HttpStatus, Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";

import { AppErrorCode } from "../../../common/exceptions/app-error-code.js";
import { createAppException } from "../../../common/exceptions/app.exception.js";
import type { AuthenticatedUser } from "../../../common/interfaces/authenticated-request.js";
import { ENTITIES_PORT } from "../../entities/interfaces/entities.port.js";
import type { EntitiesPort } from "../../entities/interfaces/entities.port.js";
import type {
  ActiveNowItemDto,
  ActiveNowListDto,
  EntityChatMessageDto,
  EntityChatMessagesPageDto,
  EntityChatOnlineCountDto
} from "../dto/entity-chat.dto.js";
import { EntityChatRepository } from "../repositories/entity-chat.repository.js";
import { ChatRateLimiterService } from "./chat-rate-limiter.service.js";
import { PresenceService } from "./presence.service.js";

const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

@Injectable()
export class EntityChatService implements OnModuleInit {
  private readonly logger = new Logger(EntityChatService.name);

  constructor(
    @Inject(ENTITIES_PORT)
    private readonly entitiesPort: EntitiesPort,
    private readonly entityChatRepository: EntityChatRepository,
    private readonly presenceService: PresenceService,
    private readonly chatRateLimiterService: ChatRateLimiterService
  ) {}

  onModuleInit(): void {
    void this.runCleanupSafely();

    setInterval(() => {
      void this.runCleanupSafely();
    }, CLEANUP_INTERVAL_MS).unref();
  }

  async listMessages(entityId: string, before?: string, limit?: number): Promise<EntityChatMessagesPageDto> {
    await this.assertEntityIsPublic(entityId);

    const rows = await this.entityChatRepository.listMessagesWithAuthors(entityId, before, limit);
    const chronological = [...rows].reverse();
    const messages = chronological.map((row) => mapMessageDto(row));
    const oldestLoaded = rows.at(-1);
    const pageSize = limit ?? 100;

    return {
      messages,
      nextCursor: rows.length >= Math.min(pageSize, 100) && oldestLoaded ? oldestLoaded.id : null
    };
  }

  async getOnlineCount(entityId: string): Promise<EntityChatOnlineCountDto> {
    await this.assertEntityIsPublic(entityId);

    return {
      entityId,
      onlineCount: await this.presenceService.getOnlineCount(entityId)
    };
  }

  async getActiveNow(limit = 5): Promise<ActiveNowListDto> {
    const rows = await this.entityChatRepository.findActiveNowAggregates(limit);
    const items: ActiveNowItemDto[] = [];

    for (const row of rows) {
      const messageCount = Number(row.messageCount);
      const participantCount = Number(row.participantCount);
      const onlineCount = await this.presenceService.getOnlineCount(row.entityId);

      items.push({
        entityId: row.entityId,
        entitySlug: row.entitySlug,
        entityTitle: row.entityTitle,
        messageCount,
        onlineCount,
        participantCount,
        previewMessage: row.previewMessage,
        score: messageCount * 2 + participantCount
      });
    }

    return { items };
  }

  async sendMessage(
    entityId: string,
    message: string,
    currentUser: AuthenticatedUser
  ): Promise<EntityChatMessageDto> {
    await this.assertEntityIsPublic(entityId);
    await this.chatRateLimiterService.assertCanSendMessage(currentUser.id);

    const trimmedMessage = message.trim();

    if (!trimmedMessage) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "Message must not be empty",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    const created = await this.entityChatRepository.createMessage({
      entityId,
      message: trimmedMessage,
      userId: currentUser.id
    });

    return {
      createdAt: created.createdAt.toISOString(),
      displayName: currentUser.displayName,
      entityId: created.entityId,
      id: created.id,
      message: created.message,
      userId: created.userId
    };
  }

  async joinRoom(entityId: string, userId: string): Promise<number> {
    await this.assertEntityIsPublic(entityId);

    return this.presenceService.markOnline(entityId, userId);
  }

  async leaveRoom(entityId: string, userId: string): Promise<number> {
    return this.presenceService.markOffline(entityId, userId);
  }

  private async assertEntityIsPublic(entityId: string): Promise<void> {
    const entity = await this.entitiesPort.findEntityById(entityId);

    if (!entity || entity.visibility !== "ACTIVE") {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Entity not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }
  }

  private async runCleanupSafely(): Promise<void> {
    try {
      const result = await this.entityChatRepository.cleanupOldMessages();

      if (result.deletedByAge > 0 || result.trimmedByEntity > 0) {
        this.logger.log(
          `Chat cleanup removed ${result.deletedByAge} aged messages and trimmed ${result.trimmedByEntity} overflow messages`
        );
      }
    } catch (error) {
      this.logger.error(
        error instanceof Error ? error.message : "Unknown chat cleanup error",
        error instanceof Error ? error.stack : undefined
      );
    }
  }
}

function mapMessageDto(row: {
  createdAt: Date;
  entityId: string;
  id: string;
  message: string;
  user: {
    displayName: string;
  };
  userId: string;
}): EntityChatMessageDto {
  return {
    createdAt: row.createdAt.toISOString(),
    displayName: row.user.displayName,
    entityId: row.entityId,
    id: row.id,
    message: row.message,
    userId: row.userId
  };
}

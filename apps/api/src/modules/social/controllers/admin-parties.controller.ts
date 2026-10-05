import { Controller, Get, Header, Param, ParseUUIDPipe, Query, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../../../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../../../common/interfaces/authenticated-request.js";
import { AdminGuard } from "../../auth/guards/admin.guard.js";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard.js";
import {
  ListAdminPartiesQueryDto,
  ListAdminPartyChatQueryDto,
  ListAdminPartyChatArchivesQueryDto
} from "../dto/admin-parties.dto.js";
import { AdminPartiesService } from "../services/admin-parties.service.js";

@Controller("admin/parties")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminPartiesController {
  constructor(private readonly adminPartiesService: AdminPartiesService) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  list(@CurrentUser() actor: AuthenticatedUser, @Query() input: ListAdminPartiesQueryDto) {
    return this.adminPartiesService.listParties(actor, input);
  }

  @Get("archives")
  @Header("Cache-Control", "private, no-store")
  archives(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() input: ListAdminPartyChatArchivesQueryDto
  ) {
    return this.adminPartiesService.listChatArchives(actor, input);
  }

  @Get("archives/:archiveId/messages")
  @Header("Cache-Control", "private, no-store")
  archivedChat(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("archiveId", new ParseUUIDPipe()) archiveId: string,
    @Query() input: ListAdminPartyChatQueryDto
  ) {
    return this.adminPartiesService.listArchivedChatMessages(
      actor,
      archiveId,
      input.before,
      input.limit
    );
  }

  @Get(":partyId/chat/messages")
  @Header("Cache-Control", "private, no-store")
  chat(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("partyId", new ParseUUIDPipe()) partyId: string,
    @Query() input: ListAdminPartyChatQueryDto
  ) {
    return this.adminPartiesService.listChatMessages(actor, partyId, input.before, input.limit);
  }
}

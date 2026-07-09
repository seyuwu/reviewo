import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import { ContributionStatus } from "#prisma/client";

import { CurrentUser } from "../../../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../../../common/interfaces/authenticated-request.js";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard.js";
import { CreateContributionDto } from "../dto/create-contribution.dto.js";
import type { ContributionDto, ContributionListResponseDto } from "../dto/contribution.dto.js";
import type { EditorStatsDto } from "../dto/admin-contribution.dto.js";
import type { DuplicateSuggestionsResponseDto } from "../dto/duplicate-suggestion.dto.js";
import type { FieldProvenanceListResponseDto } from "../dto/field-provenance.dto.js";
import { VoteContributionDto } from "../dto/vote-contribution.dto.js";
import { ContributionsService } from "../services/contributions.service.js";

@Controller()
export class ContributionsController {
  constructor(private readonly contributionsService: ContributionsService) {}

  @Post("entities/:entityId/contributions")
  @UseGuards(JwtAuthGuard)
  async createContribution(
    @Param("entityId", new ParseUUIDPipe({ version: "4" })) entityId: string,
    @Body() input: CreateContributionDto,
    @CurrentUser() currentUser: AuthenticatedUser
  ): Promise<ContributionDto> {
    return this.contributionsService.createContribution(entityId, input, currentUser);
  }

  @Get("entities/:entityId/contributions")
  async listContributions(
    @Param("entityId", new ParseUUIDPipe({ version: "4" })) entityId: string,
    @Query("status") status?: ContributionStatus
  ): Promise<ContributionListResponseDto> {
    return this.contributionsService.listContributions(entityId, status);
  }

  @Post("contributions/:contributionId/vote")
  @UseGuards(JwtAuthGuard)
  async voteContribution(
    @Param("contributionId", new ParseUUIDPipe({ version: "4" })) contributionId: string,
    @Body() input: VoteContributionDto,
    @CurrentUser() currentUser: AuthenticatedUser
  ): Promise<ContributionDto> {
    return this.contributionsService.voteContribution(contributionId, input, currentUser);
  }

  @Get("entities/:entityId/field-provenance")
  async getFieldProvenance(
    @Param("entityId", new ParseUUIDPipe({ version: "4" })) entityId: string
  ): Promise<FieldProvenanceListResponseDto> {
    return this.contributionsService.getFieldProvenance(entityId);
  }

  @Get("entities/:entityId/duplicate-suggestions")
  async getDuplicateSuggestions(
    @Param("entityId", new ParseUUIDPipe({ version: "4" })) entityId: string
  ): Promise<DuplicateSuggestionsResponseDto> {
    return this.contributionsService.getDuplicateSuggestions(entityId);
  }

  @Get("contributions/me/editor-stats")
  @UseGuards(JwtAuthGuard)
  async getEditorStats(@CurrentUser() currentUser: AuthenticatedUser): Promise<EditorStatsDto> {
    return this.contributionsService.getEditorStats(currentUser.id);
  }
}

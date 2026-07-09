import { ContributionVoteKind } from "#prisma/client";
import { IsEnum } from "class-validator";

export class VoteContributionDto {
  @IsEnum(ContributionVoteKind)
  kind!: ContributionVoteKind;
}

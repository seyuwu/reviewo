import { ContributionType } from "#prisma/client";
import { IsEnum, IsObject } from "class-validator";

export class CreateContributionDto {
  @IsEnum(ContributionType)
  type!: ContributionType;

  @IsObject()
  payload!: Record<string, unknown>;
}

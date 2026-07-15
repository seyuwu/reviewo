import { IsIn, IsOptional, IsString, MinLength, ValidateIf } from "class-validator";

import { DOTA_POSITION_ROLES } from "@reviewo/shared";

export class StackInviteDto {
  /** Optional existing TEAM/PARTY slug to invite from (must be owned by caller). */
  @IsOptional()
  @IsString()
  @MinLength(1)
  partySlug?: string;

  /** Lane role for application / invite (1–5). Required when joining a recruiting party. */
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsOptional()
  @IsIn([...DOTA_POSITION_ROLES])
  positionRole?: "1" | "2" | "3" | "4" | "5";

  @IsString()
  @MinLength(1)
  targetSlug!: string;
}

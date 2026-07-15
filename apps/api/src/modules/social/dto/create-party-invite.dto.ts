import { IsIn, IsOptional, IsUUID, ValidateIf } from "class-validator";

import { DOTA_POSITION_ROLES } from "@reviewo/shared";

export class CreatePartyInviteDto {
  @IsUUID("4")
  userId!: string;

  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsOptional()
  @IsIn([...DOTA_POSITION_ROLES])
  positionRole?: "1" | "2" | "3" | "4" | "5";
}

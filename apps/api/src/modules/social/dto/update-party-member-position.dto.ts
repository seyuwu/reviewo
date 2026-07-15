import { IsIn, ValidateIf } from "class-validator";

import { DOTA_POSITION_ROLES } from "@reviewo/shared";

export class UpdatePartyMemberPositionDto {
  @ValidateIf((_, value) => value !== null)
  @IsIn([...DOTA_POSITION_ROLES])
  positionRole!: "1" | "2" | "3" | "4" | "5" | null;
}

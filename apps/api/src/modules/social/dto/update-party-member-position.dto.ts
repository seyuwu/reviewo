import { Allow, IsIn, ValidateIf } from "class-validator";

import { DOTA_POSITION_ROLES } from "@reviewo/shared";

export class UpdatePartyMemberPositionDto {
  /** @Allow keeps null through ValidationPipe whitelist when clearing a slot. */
  @Allow()
  @ValidateIf((_, value) => value !== null)
  @IsIn([...DOTA_POSITION_ROLES])
  positionRole!: "1" | "2" | "3" | "4" | "5" | null;
}

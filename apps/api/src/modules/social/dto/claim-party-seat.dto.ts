import { IsIn } from "class-validator";

const DOTA_POSITION_ROLES = ["1", "2", "3", "4", "5"] as const;

export class ClaimPartySeatDto {
  @IsIn(DOTA_POSITION_ROLES)
  positionRole!: (typeof DOTA_POSITION_ROLES)[number];
}

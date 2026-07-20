import { IsIn, IsOptional, IsString, MinLength } from "class-validator";

const DOTA_POSITION_ROLES = ["1", "2", "3", "4", "5"] as const;

export class JoinPartyByTokenDto {
  /** Signed party-join JWT, or short Redis join code from share links. */
  @IsString()
  @MinLength(1)
  token!: string;

  /** Optional seat claimed on the landing page before auth. */
  @IsOptional()
  @IsIn(DOTA_POSITION_ROLES)
  positionRole?: (typeof DOTA_POSITION_ROLES)[number];
}

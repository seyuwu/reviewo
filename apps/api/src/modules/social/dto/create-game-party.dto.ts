import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import type { GamePartyKind } from "@reviewo/shared";

export class CreateGamePartyDto {
  @IsOptional()
  @IsIn(["TEAM", "PARTY"])
  kind?: GamePartyKind;

  /** Optional; when omitted the API generates a Dota-flavored name. */
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;
}

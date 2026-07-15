import { IsString, MinLength } from "class-validator";

export class JoinPartyByTokenDto {
  /** Signed party-join JWT from an auto-join share link. */
  @IsString()
  @MinLength(1)
  token!: string;
}

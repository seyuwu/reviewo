import { IsString, MinLength, MaxLength } from "class-validator";

export class RedeemFriendInviteDto {
  /** Signed friend-invite JWT from the inviter’s share link. */
  @IsString()
  @MinLength(20)
  @MaxLength(2048)
  token!: string;
}

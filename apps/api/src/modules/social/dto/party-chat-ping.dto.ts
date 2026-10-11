import { IsString, IsUUID, Matches } from "class-validator";

export class PartyChatPingDto {
  @IsString()
  @Matches(/^\d{1,20}$/)
  telegramUserId!: string;

  @IsUUID()
  partyId!: string;

  @IsUUID()
  membershipId!: string;

  @IsUUID()
  targetMembershipId!: string;
}

export interface PartyChatPingPayload {
  type: "party_chat_ping";
  partyId: string;
  partySlug: string;
  senderUserId: string;
  senderTelegramUserId: string;
  senderMembershipId: string;
  targetUserId: string;
  targetMembershipId: string;
  expiresAt: string;
}

export interface PartyChatPingDelivery {
  senderName: string;
  partyName: string;
  partyId: string;
  partySlug: string;
  expiresAt: string;
}

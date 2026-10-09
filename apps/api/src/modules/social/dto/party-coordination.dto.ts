import { IsBoolean, IsUUID } from "class-validator";

export class SetPartyReadyDto {
  @IsUUID()
  membershipId!: string;

  @IsBoolean()
  ready!: boolean;
}

export class SharePartyTelegramContactDto {
  @IsUUID()
  membershipId!: string;

  @IsBoolean()
  visible!: boolean;
}

export interface PartyCoordinationResponse {
  id: string;
  slug: string;
  name: string;
  expiresAt: string | null;
  maxMembers: number;
  members: Array<{
    membershipId: string;
    userId: string;
    displayName: string;
    positionRole: string | null;
    isSelf: boolean;
    readyAt: string | null;
    telegramUsername: string | null;
    telegramContactShared: boolean;
    telegramContactPublic: boolean;
  }>;
}

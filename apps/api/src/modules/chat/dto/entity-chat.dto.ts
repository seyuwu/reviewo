export interface EntityChatMessageDto {
  createdAt: string;
  displayName: string;
  entityId: string;
  id: string;
  message: string;
}

export interface EntityChatMessagesPageDto {
  messages: EntityChatMessageDto[];
  nextCursor: string | null;
}

export interface EntityChatOnlineCountDto {
  entityId: string;
  onlineCount: number;
}

export interface ActiveNowItemDto {
  entityId: string;
  entityTitle: string;
  entitySlug: string;
  messageCount: number;
  onlineCount: number;
  participantCount: number;
  previewMessage: string | null;
  score: number;
}

export interface ActiveNowListDto {
  items: ActiveNowItemDto[];
}

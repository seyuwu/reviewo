export interface EntityChatMessageDto {
  createdAt: string;
  displayName: string;
  entityId: string;
  id: string;
  locale: string;
  message: string;
}

export interface EntityChatMessagesPageDto {
  locale: string;
  messages: EntityChatMessageDto[];
  nextCursor: string | null;
}

export interface EntityChatOnlineCountDto {
  entityId: string;
  locale: string;
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

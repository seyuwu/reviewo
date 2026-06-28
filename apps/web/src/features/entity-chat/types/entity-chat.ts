export interface EntityChatMessage {
  createdAt: string;
  displayName: string;
  entityId: string;
  id: string;
  message: string;
}

export interface EntityChatMessagesPage {
  messages: EntityChatMessage[];
  nextCursor: string | null;
}

export interface EntityChatOnlineCount {
  entityId: string;
  onlineCount: number;
}

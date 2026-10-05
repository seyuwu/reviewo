import { apiRequest } from "../../../lib/api/api-client";
import type { GamePartyChatMessagesPage } from "../../social/types/social";

export interface AdminPartySummary {
  createdAt: string;
  expiresAt: string | null;
  id: string;
  joinMode: "OPEN" | "CONFIRM";
  kind: "PARTY" | "TEAM";
  maxMembers: number;
  members: Array<{
    displayName: string;
    positionRole: string | null;
    role: "OWNER" | "OFFICER" | "MEMBER";
    userId: string;
  }>;
  name: string;
  slug: string;
  visibility: "PUBLIC" | "PRIVATE";
}

export interface AdminPartiesPage {
  items: AdminPartySummary[];
  nextCursor: string | null;
  total: number;
}

export function fetchAllActiveParties(
  accessToken: string,
  input: { before?: string | undefined; kind?: "PARTY" | "TEAM" | undefined } = {}
): Promise<AdminPartiesPage> {
  const params = new URLSearchParams({ limit: "25" });
  if (input.before) params.set("before", input.before);
  if (input.kind) params.set("kind", input.kind);
  return apiRequest<AdminPartiesPage>(`/admin/parties?${params.toString()}`, {
    headers: { authorization: `Bearer ${accessToken}` }
  });
}

export function fetchAdminPartyChat(
  partyId: string,
  accessToken: string,
  before?: string
): Promise<GamePartyChatMessagesPage> {
  const params = new URLSearchParams({ limit: "50" });
  if (before) params.set("before", before);
  return apiRequest<GamePartyChatMessagesPage>(
    `/admin/parties/${encodeURIComponent(partyId)}/chat/messages?${params.toString()}`,
    { headers: { authorization: `Bearer ${accessToken}` } }
  );
}

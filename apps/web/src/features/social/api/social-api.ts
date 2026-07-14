import { apiRequest } from "../../../lib/api/api-client";
import type {
  FriendsListResponse,
  FriendshipRequest,
  FriendshipRequestsResponse,
  FriendUser,
  GameParty,
  GamePartyChatMessage,
  GamePartyChatMessagesPage,
  GamePartyInvite,
  GamePartyKind,
  MyPartiesResponse
} from "../types/social";

function authHeaders(accessToken: string) {
  return {
    authorization: `Bearer ${accessToken}`
  };
}

export function fetchFriends(accessToken: string): Promise<FriendsListResponse> {
  return apiRequest<FriendsListResponse>("/social/friends", {
    headers: authHeaders(accessToken)
  });
}

export function fetchFriendRequests(accessToken: string): Promise<FriendshipRequestsResponse> {
  return apiRequest<FriendshipRequestsResponse>("/social/friends/requests", {
    headers: authHeaders(accessToken)
  });
}

export function sendFriendRequest(userId: string, accessToken: string): Promise<FriendshipRequest> {
  return apiRequest<FriendshipRequest>("/social/friends/requests", {
    body: { userId },
    headers: authHeaders(accessToken),
    method: "POST"
  });
}

export function acceptFriendRequest(requestId: string, accessToken: string): Promise<FriendUser> {
  return apiRequest<FriendUser>(`/social/friends/requests/${encodeURIComponent(requestId)}/accept`, {
    headers: authHeaders(accessToken),
    method: "POST"
  });
}

export function declineFriendRequest(requestId: string, accessToken: string): Promise<{ ok: true }> {
  return apiRequest<{ ok: true }>(
    `/social/friends/requests/${encodeURIComponent(requestId)}/decline`,
    {
      headers: authHeaders(accessToken),
      method: "POST"
    }
  );
}

export function redeemFriendInvite(token: string, accessToken: string): Promise<FriendUser> {
  return apiRequest<FriendUser>("/social/friends/invite/redeem", {
    body: { token },
    headers: authHeaders(accessToken),
    method: "POST"
  });
}

export function fetchFriendInviteToken(accessToken: string): Promise<{ token: string }> {
  return apiRequest<{ token: string }>("/social/friends/invite-token", {
    headers: authHeaders(accessToken)
  });
}

export function removeFriend(userId: string, accessToken: string): Promise<{ ok: true }> {
  return apiRequest<{ ok: true }>(`/social/friends/${encodeURIComponent(userId)}`, {
    headers: authHeaders(accessToken),
    method: "DELETE"
  });
}

export function createGameParty(kind: GamePartyKind, accessToken: string): Promise<GameParty> {
  return apiRequest<GameParty>("/social/parties", {
    body: { kind },
    headers: authHeaders(accessToken),
    method: "POST"
  });
}

export function renameGameParty(
  slug: string,
  name: string,
  accessToken: string
): Promise<GameParty> {
  return apiRequest<GameParty>(`/social/parties/${encodeURIComponent(slug)}`, {
    body: { name },
    headers: authHeaders(accessToken),
    method: "PATCH"
  });
}

export function fetchGameParty(slug: string, accessToken?: string): Promise<GameParty> {
  return apiRequest<GameParty>(`/social/parties/${encodeURIComponent(slug)}`, {
    ...(accessToken ? { headers: authHeaders(accessToken) } : {})
  });
}

export function fetchMyParties(accessToken: string): Promise<MyPartiesResponse> {
  return apiRequest<MyPartiesResponse>("/social/parties/me", {
    headers: authHeaders(accessToken)
  });
}

export function inviteFriendToParty(
  slug: string,
  userId: string,
  accessToken: string
): Promise<GamePartyInvite> {
  return apiRequest<GamePartyInvite>(`/social/parties/${encodeURIComponent(slug)}/invites`, {
    body: { userId },
    headers: authHeaders(accessToken),
    method: "POST"
  });
}

export function acceptPartyInvite(inviteId: string, accessToken: string): Promise<GameParty> {
  return apiRequest<GameParty>(`/social/parties/invites/${encodeURIComponent(inviteId)}/accept`, {
    headers: authHeaders(accessToken),
    method: "POST"
  });
}

export function declinePartyInvite(inviteId: string, accessToken: string): Promise<{ ok: true }> {
  return apiRequest<{ ok: true }>(
    `/social/parties/invites/${encodeURIComponent(inviteId)}/decline`,
    {
      headers: authHeaders(accessToken),
      method: "POST"
    }
  );
}

export function leaveGameParty(slug: string, accessToken: string): Promise<{ ok: true }> {
  return apiRequest<{ ok: true }>(`/social/parties/${encodeURIComponent(slug)}/members/me`, {
    headers: authHeaders(accessToken),
    method: "DELETE"
  });
}

export function fetchPartyChatMessages(
  slug: string,
  accessToken: string,
  before?: string
): Promise<GamePartyChatMessagesPage> {
  const query = before ? `?before=${encodeURIComponent(before)}` : "";
  return apiRequest<GamePartyChatMessagesPage>(
    `/social/parties/${encodeURIComponent(slug)}/messages${query}`,
    {
      headers: authHeaders(accessToken)
    }
  );
}

export function sendPartyChatMessage(
  slug: string,
  message: string,
  accessToken: string
): Promise<GamePartyChatMessage> {
  return apiRequest<GamePartyChatMessage>(`/social/parties/${encodeURIComponent(slug)}/messages`, {
    body: { message },
    headers: authHeaders(accessToken),
    method: "POST"
  });
}

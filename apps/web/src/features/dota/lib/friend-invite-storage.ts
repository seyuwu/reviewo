const PENDING_FRIEND_INVITE_KEY = "opinia.pendingFriendInvite";

export interface PendingFriendInvite {
  slug: string;
  token: string;
}

export function stashPendingFriendInvite(invite: PendingFriendInvite): void {
  try {
    window.sessionStorage.setItem(PENDING_FRIEND_INVITE_KEY, JSON.stringify(invite));
  } catch {
    // Ignore storage failures.
  }
}

export function peekPendingFriendInvite(): PendingFriendInvite | null {
  try {
    const raw = window.sessionStorage.getItem(PENDING_FRIEND_INVITE_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<PendingFriendInvite>;

    if (
      typeof parsed.slug !== "string" ||
      parsed.slug.length < 1 ||
      typeof parsed.token !== "string" ||
      parsed.token.length < 20
    ) {
      return null;
    }

    return { slug: parsed.slug, token: parsed.token };
  } catch {
    return null;
  }
}

export function consumePendingFriendInvite(expectedSlug?: string): PendingFriendInvite | null {
  try {
    const invite = peekPendingFriendInvite();

    if (!invite) {
      return null;
    }

    if (expectedSlug && invite.slug !== expectedSlug) {
      return null;
    }

    window.sessionStorage.removeItem(PENDING_FRIEND_INVITE_KEY);
    return invite;
  } catch {
    return null;
  }
}

"use client";

import { useState } from "react";

import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { useTranslation } from "../../i18n/locale-provider";
import {
  acceptFriendRequest,
  declineFriendRequest,
  removeFriend,
  sendFriendRequest
} from "../../social/api/social-api";
import type { DotaProfile } from "../types/dota";
import styles from "./dota-friendship-actions.module.css";

interface DotaFriendshipActionsProps {
  onProfileUpdated: (profile: DotaProfile) => void;
  profile: DotaProfile;
}

export function DotaFriendshipActions({ onProfileUpdated, profile }: DotaFriendshipActionsProps) {
  const t = useTranslation();
  const { authSession } = useAuthSession();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!profile.ownerUserId || profile.friendshipStatus === "self" || profile.isOwner) {
    return null;
  }

  if (!authSession?.accessToken) {
    return (
      <p className={styles.hint}>{t("dota.friends.signInHint")}</p>
    );
  }

  async function runAction(action: () => Promise<void>) {
    setError(null);
    setPending(true);

    try {
      await action();
    } catch {
      setError(t("dota.friends.actionError"));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={styles.wrap}>
      {profile.friendshipStatus === "none" || profile.friendshipStatus === null ? (
        <button
          className="button-secondary"
          disabled={pending}
          onClick={() =>
            void runAction(async () => {
              await sendFriendRequest(profile.ownerUserId!, authSession.accessToken).then((request) => {
                onProfileUpdated({
                  ...profile,
                  friendshipRequestId: request.id,
                  friendshipStatus: "outgoing"
                });
              });
            })
          }
          type="button"
        >
          {t("dota.friends.add")}
        </button>
      ) : null}

      {profile.friendshipStatus === "outgoing" ? (
        <button
          className="button-secondary"
          disabled={pending}
          onClick={() =>
            void runAction(async () => {
              await removeFriend(profile.ownerUserId!, authSession.accessToken);
              onProfileUpdated({
                ...profile,
                friendshipRequestId: null,
                friendshipStatus: "none"
              });
            })
          }
          type="button"
        >
          {t("dota.friends.cancelRequest")}
        </button>
      ) : null}

      {profile.friendshipStatus === "incoming" && profile.friendshipRequestId ? (
        <div className={styles.row}>
          <button
            className="button-primary"
            disabled={pending}
            onClick={() =>
              void runAction(async () => {
                await acceptFriendRequest(profile.friendshipRequestId!, authSession.accessToken);
                onProfileUpdated({
                  ...profile,
                  friendshipStatus: "friends"
                });
              })
            }
            type="button"
          >
            {t("dota.friends.accept")}
          </button>
          <button
            className="button-secondary"
            disabled={pending}
            onClick={() =>
              void runAction(async () => {
                await declineFriendRequest(profile.friendshipRequestId!, authSession.accessToken);
                onProfileUpdated({
                  ...profile,
                  friendshipRequestId: null,
                  friendshipStatus: "none"
                });
              })
            }
            type="button"
          >
            {t("dota.friends.decline")}
          </button>
        </div>
      ) : null}

      {profile.friendshipStatus === "friends" ? (
        <button
          className="button-secondary"
          disabled={pending}
          onClick={() =>
            void runAction(async () => {
              await removeFriend(profile.ownerUserId!, authSession.accessToken);
              onProfileUpdated({
                ...profile,
                friendshipRequestId: null,
                friendshipStatus: "none"
              });
            })
          }
          type="button"
        >
          {t("dota.friends.remove")}
        </button>
      ) : null}

      {error ? <p className={styles.error}>{error}</p> : null}
    </div>
  );
}

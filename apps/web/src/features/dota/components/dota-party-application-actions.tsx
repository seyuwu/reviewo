"use client";

import type { DotaGreenFlagKey, DotaRedFlagKey } from "@reviewo/shared";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { FormFeedback } from "../../../components/form-feedback";
import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { resolveInviteDecisionError } from "../../games/lib/resolve-stack-invite-error";
import { useTranslation } from "../../i18n/locale-provider";
import {
  acceptPartyInvite,
  declinePartyInvite,
  fetchMyParties
} from "../../social/api/social-api";
import type { GamePartyInvite } from "../../social/types/social";
import {
  getDotaGreenFlagLabel,
  getDotaPositionLabel,
  getDotaRedFlagLabel
} from "../lib/labels";
import styles from "./dota-party-application-actions.module.css";

interface DotaPartyApplicationActionsProps {
  ownerUserId: string | null;
}

export function DotaPartyApplicationActions({ ownerUserId }: DotaPartyApplicationActionsProps) {
  const t = useTranslation();
  const router = useRouter();
  const { authSession } = useAuthSession();
  const [applications, setApplications] = useState<GamePartyInvite[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authSession?.accessToken || !ownerUserId) {
      setApplications([]);
      return;
    }

    let cancelled = false;

    void fetchMyParties(authSession.accessToken)
      .then((response) => {
        if (cancelled) {
          return;
        }

        setApplications(
          (response.outgoingInvites ?? []).filter(
            (invite) =>
              invite.status === "PENDING" &&
              invite.inviteKind === "APPLICATION" &&
              invite.inviteeUserId === ownerUserId
          )
        );
      })
      .catch(() => {
        if (!cancelled) {
          setApplications([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authSession?.accessToken, ownerUserId]);

  if (applications.length === 0 && !error) {
    return null;
  }

  async function handleAccept(invite: GamePartyInvite) {
    if (!authSession?.accessToken) {
      return;
    }

    setBusyId(invite.id);
    setError(null);

    try {
      const joined = await acceptPartyInvite(invite.id, authSession.accessToken);
      setApplications((current) => current.filter((item) => item.id !== invite.id));
      router.push(`/dota/teams/${joined.slug}`);
    } catch (acceptError) {
      setError(resolveInviteDecisionError(acceptError, t));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDecline(invite: GamePartyInvite) {
    if (!authSession?.accessToken) {
      return;
    }

    setBusyId(invite.id);
    setError(null);

    try {
      await declinePartyInvite(invite.id, authSession.accessToken);
      setApplications((current) => current.filter((item) => item.id !== invite.id));
    } catch (declineError) {
      setError(resolveInviteDecisionError(declineError, t));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className={styles.wrap}>
      <p className={styles.title}>{t("dota.team.incomingApplications")}</p>
      {error ? <FormFeedback errorMessage={error} /> : null}
      {applications.length === 0 ? null : (
        <ul className={styles.list}>
          {applications.map((invite) => (
            <li className={styles.item} key={invite.id}>
              <div className={styles.copy}>
                <strong>{invite.partyName}</strong>
                <span>
                  {t("games.search.applicationForRole", {
                    role: invite.positionRole
                      ? `${invite.positionRole} ${getDotaPositionLabel(invite.positionRole, t)}`
                      : "—"
                  })}
                </span>
              </div>
              {(invite.redFlags?.length ?? 0) > 0 || (invite.greenFlags?.length ?? 0) > 0 ? (
                <div className={styles.flags}>
                  {(invite.redFlags ?? []).map((flag) => (
                    <span className={styles.flagRed} key={`${invite.id}-r-${flag.key}`}>
                      {getDotaRedFlagLabel(flag.key as DotaRedFlagKey, t)}
                      {flag.count > 1 ? ` · ${flag.count}` : ""}
                    </span>
                  ))}
                  {(invite.greenFlags ?? []).map((flag) => (
                    <span className={styles.flagGreen} key={`${invite.id}-g-${flag.key}`}>
                      {getDotaGreenFlagLabel(flag.key as DotaGreenFlagKey, t)}
                      {flag.count > 1 ? ` · ${flag.count}` : ""}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className={styles.actions}>
                <button
                  className="button-primary"
                  disabled={busyId === invite.id}
                  onClick={() => void handleAccept(invite)}
                  type="button"
                >
                  {t("games.search.acceptApplication")}
                </button>
                <button
                  className="button-secondary"
                  disabled={busyId === invite.id}
                  onClick={() => void handleDecline(invite)}
                  type="button"
                >
                  {t("games.search.declineApplication")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

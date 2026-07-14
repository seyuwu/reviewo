"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { useTranslation } from "../../i18n/locale-provider";
import {
  acceptPartyInvite,
  declinePartyInvite,
  fetchMyParties
} from "../../social/api/social-api";
import type { GameParty, GamePartyInvite, MyPartiesResponse } from "../../social/types/social";
import styles from "./dota-team-owner-actions.module.css";

export function DotaTeamOwnerActions() {
  const t = useTranslation();
  const { authSession } = useAuthSession();
  const [data, setData] = useState<MyPartiesResponse | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    if (!authSession?.accessToken) {
      return;
    }

    let cancelled = false;

    void fetchMyParties(authSession.accessToken)
      .then((response) => {
        if (!cancelled) {
          setData(response);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setData(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authSession?.accessToken]);

  async function handleAccept(invite: GamePartyInvite) {
    if (!authSession?.accessToken) {
      return;
    }

    setPendingId(invite.id);

    try {
      const joined = await acceptPartyInvite(invite.id, authSession.accessToken);
      setData((current) => mergeJoinedParty(current, joined, invite.id));
    } finally {
      setPendingId(null);
    }
  }

  async function handleDecline(invite: GamePartyInvite) {
    if (!authSession?.accessToken) {
      return;
    }

    setPendingId(invite.id);

    try {
      await declinePartyInvite(invite.id, authSession.accessToken);
      setData({
        invites: (data?.invites ?? []).filter((item) => item.id !== invite.id),
        party: data?.party ?? null,
        team: data?.team ?? null
      });
    } finally {
      setPendingId(null);
    }
  }

  const hasTeam = Boolean(data?.team);
  const hasParty = Boolean(data?.party);

  return (
    <div className={styles.wrap}>
      {data?.team ? (
        <Link className="button-secondary" href={`/dota/teams/${data.team.slug}`}>
          {t("dota.team.openMine", {
            current: String(data.team.memberCount),
            max: String(data.team.maxMembers)
          })}
        </Link>
      ) : null}
      {data?.party ? (
        <Link className="button-secondary" href={`/dota/teams/${data.party.slug}`}>
          {t("dota.team.openMineParty", {
            current: String(data.party.memberCount),
            max: String(data.party.maxMembers)
          })}
        </Link>
      ) : null}
      {!hasTeam || !hasParty ? (
        <Link className="button-secondary" href="/dota/teams/create">
          {!hasTeam && !hasParty
            ? t("dota.team.createCta")
            : !hasTeam
              ? t("dota.team.createTeamOnlyCta")
              : t("dota.team.createPartyCta")}
        </Link>
      ) : null}

      {(data?.invites.length ?? 0) > 0 ? (
        <div className={styles.invites}>
          <p>{t("dota.team.incomingInvites")}</p>
          <ul>
            {data?.invites.map((invite) => (
              <li key={invite.id}>
                <span>
                  {invite.partyName}
                  {invite.kind === "PARTY" ? ` · ${t("dota.team.kindParty")}` : ""}
                </span>
                <button
                  className="button-primary"
                  disabled={pendingId === invite.id}
                  onClick={() => void handleAccept(invite)}
                  type="button"
                >
                  {t("dota.team.acceptInvite")}
                </button>
                <button
                  className="button-secondary"
                  disabled={pendingId === invite.id}
                  onClick={() => void handleDecline(invite)}
                  type="button"
                >
                  {t("dota.team.declineInvite")}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function mergeJoinedParty(
  current: MyPartiesResponse | null,
  joined: GameParty,
  inviteId: string
): MyPartiesResponse {
  const invites = (current?.invites ?? []).filter((item) => item.id !== inviteId);

  if (joined.kind === "PARTY") {
    return {
      invites,
      party: joined,
      team: current?.team ?? null
    };
  }

  return {
    invites,
    party: current?.party ?? null,
    team: joined
  };
}

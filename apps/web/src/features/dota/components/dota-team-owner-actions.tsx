"use client";

import Link from "next/link";
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
import type { GameParty, GamePartyInvite, MyPartiesResponse } from "../../social/types/social";
import styles from "./dota-team-owner-actions.module.css";

export function DotaTeamOwnerActions() {
  const t = useTranslation();
  const router = useRouter();
  const { authSession } = useAuthSession();
  const [data, setData] = useState<MyPartiesResponse | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    setError(null);

    try {
      const joined = await acceptPartyInvite(invite.id, authSession.accessToken);
      setData((current) => mergeJoinedParty(current, joined, invite.id));
      router.push(`/dota/teams/${joined.slug}`);
    } catch (acceptError) {
      setError(resolveInviteDecisionError(acceptError, t));
    } finally {
      setPendingId(null);
    }
  }

  async function handleDecline(invite: GamePartyInvite) {
    if (!authSession?.accessToken) {
      return;
    }

    setPendingId(invite.id);
    setError(null);

    try {
      await declinePartyInvite(invite.id, authSession.accessToken);
      setData({
        invites: (data?.invites ?? []).filter((item) => item.id !== invite.id),
        outgoingInvites: data?.outgoingInvites ?? [],
        parties: data?.parties ?? (data?.party ? [data.party] : []),
        party: data?.party ?? null,
        team: data?.team ?? null
      });
    } catch (declineError) {
      setError(resolveInviteDecisionError(declineError, t));
    } finally {
      setPendingId(null);
    }
  }

  const hasTeam = Boolean(data?.team);
  const partyList = data?.parties?.length
    ? data.parties
    : data?.party
      ? [data.party]
      : [];
  const hasParty = partyList.length > 0;
  const incomingInvites = (data?.invites ?? []).filter(
    (invite) => invite.inviteKind !== "APPLICATION"
  );

  return (
    <div className={styles.wrap}>
      {data?.team ? (
        <Link className="button-secondary" href={`/dota/teams/${data.team.slug}`}>
          {t("dota.team.openMine", {
            current: String(data.team.memberCount),
            max: String(data.team.maxMembers),
            name: data.team.name
          })}
        </Link>
      ) : null}
      {partyList.map((party) => (
        <Link className="button-secondary" href={`/dota/teams/${party.slug}`} key={party.id}>
          {t("dota.team.openMineParty", {
            current: String(party.memberCount),
            max: String(party.maxMembers),
            name: party.name
          })}
        </Link>
      ))}
      <Link className="button-secondary" href="/dota/teams/create">
        {!hasTeam && !hasParty
          ? t("dota.team.createCta")
          : !hasTeam
            ? t("dota.team.createTeamOnlyCta")
            : t("dota.team.createPartyCta")}
      </Link>

      {error ? <FormFeedback errorMessage={error} /> : null}

      {incomingInvites.length > 0 ? (
        <div className={styles.invites}>
          <p>{t("dota.team.incomingInvites")}</p>
          <ul>
            {incomingInvites.map((invite) => (
              <li key={invite.id}>
                <span>
                  {invite.partyName}
                  {invite.kind === "PARTY" ? ` · ${t("dota.team.kindParty")}` : ""}
                  {invite.positionRole ? ` · ${invite.positionRole}` : ""}
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
    const previousParties = current?.parties?.length
      ? current.parties
      : current?.party
        ? [current.party]
        : [];
    const parties = [joined, ...previousParties.filter((party) => party.id !== joined.id)];

    return {
      invites,
      outgoingInvites: current?.outgoingInvites ?? [],
      parties,
      party: parties[0] ?? null,
      team: current?.team ?? null
    };
  }

  return {
    invites,
    outgoingInvites: current?.outgoingInvites ?? [],
    parties: current?.parties ?? (current?.party ? [current.party] : []),
    party: current?.party ?? null,
    team: joined
  };
}

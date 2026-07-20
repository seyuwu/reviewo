"use client";

import { DOTA_TEMP_PARTY_TTL_HOURS } from "@reviewo/shared";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { useTranslation } from "../../i18n/locale-provider";
import { createGameParty } from "../../social/api/social-api";
import type { GamePartyKind } from "../../social/types/social";
import styles from "./create-roster-split-button.module.css";

interface CreateRosterSplitButtonProps {
  /** Hide or disable TEAM create when the user already owns/has a team. */
  disableTeam?: boolean;
  /** Optional callback after successful create (before navigation). */
  onCreated?: (kind: GamePartyKind) => void;
}

export function CreateRosterSplitButton({
  disableTeam = false,
  onCreated
}: CreateRosterSplitButtonProps) {
  const t = useTranslation();
  const router = useRouter();
  const { authSession } = useAuthSession();
  const [hovered, setHovered] = useState(false);
  const [pendingKind, setPendingKind] = useState<GamePartyKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  function clearCloseTimer() {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }

  function handleEnter() {
    clearCloseTimer();
    setHovered(true);
  }

  function handleLeave() {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setHovered(false);
    }, 120);
  }

  async function handleCreate(kind: GamePartyKind) {
    if (!authSession?.accessToken || pendingKind || (kind === "TEAM" && disableTeam)) {
      return;
    }

    setPendingKind(kind);
    setError(null);

    try {
      const created = await createGameParty(kind, authSession.accessToken);
      onCreated?.(kind);
      router.push(`/dota/teams/${created.slug}?created=1`);
    } catch {
      setError(t("dota.team.createError"));
      setPendingKind(null);
    }
  }

  if (!authSession?.accessToken) {
    return null;
  }

  const showSplit = hovered || pendingKind !== null;

  return (
    <div className={styles.root} onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      {showSplit ? (
        <div className={styles.split} role="group" aria-label={t("dota.team.createSplitCta")}>
          <button
            className={styles.half}
            disabled={disableTeam || pendingKind !== null}
            onClick={() => void handleCreate("TEAM")}
            title={
              disableTeam ? t("dota.team.createTeamDisabled") : t("dota.team.kindTeamHint")
            }
            type="button"
          >
            {pendingKind === "TEAM"
              ? t("common.loadingEllipsis")
              : t("dota.team.kindTeam")}
          </button>
          <button
            className={`${styles.half} ${styles.halfParty}`}
            disabled={pendingKind !== null}
            onClick={() => void handleCreate("PARTY")}
            title={t("dota.team.kindPartyHint", {
              hours: String(DOTA_TEMP_PARTY_TTL_HOURS)
            })}
            type="button"
          >
            {pendingKind === "PARTY"
              ? t("common.loadingEllipsis")
              : t("dota.team.kindParty")}
          </button>
        </div>
      ) : (
        <button
          className={styles.trigger}
          onClick={() => setHovered(true)}
          onFocus={() => setHovered(true)}
          type="button"
        >
          {t("dota.team.createSplitCta")}
        </button>
      )}

      {error ? <p className={styles.error}>{error}</p> : null}
    </div>
  );
}

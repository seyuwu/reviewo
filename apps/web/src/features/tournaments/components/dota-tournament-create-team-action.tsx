"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { fetchMyParties } from "../../social/api/social-api";
import { useTranslation } from "../../i18n/locale-provider";
import styles from "./dota-tournaments-view.module.css";

interface DotaTournamentCreateTeamActionProps {
  children: ReactNode;
  className: string;
  href: string;
}

export function DotaTournamentCreateTeamAction({
  children,
  className,
  href
}: DotaTournamentCreateTeamActionProps) {
  const t = useTranslation();
  const { authSession, isAuthSessionLoaded } = useAuthSession();
  const [hasTeam, setHasTeam] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isAuthSessionLoaded) return;

    const accessToken = authSession?.accessToken;
    if (!accessToken) {
      setHasTeam(false);
      return;
    }

    let active = true;
    setHasTeam(null);
    void fetchMyParties(accessToken)
      .then((parties) => {
        if (active) setHasTeam(Boolean(parties.team));
      })
      .catch(() => {
        if (active) setHasTeam(false);
      });

    return () => {
      active = false;
    };
  }, [authSession?.accessToken, isAuthSessionLoaded]);

  if (hasTeam === false) {
    return (
      <Link className={className} href={href}>
        {children}
      </Link>
    );
  }

  const descriptionId = "dota-tournament-create-team-disabled";
  const description = hasTeam
    ? t("dota.team.createTeamDisabled")
    : t("common.loadingEllipsis");

  return (
    <span
      className={styles.disabledCreateTeamWrap}
    >
      <button
        aria-describedby={descriptionId}
        aria-disabled="true"
        className={`${className} ${styles.disabledCreateTeamButton}`}
        disabled
        type="button"
      >
        {children}
      </button>
      <span className={styles.disabledCreateTeamTooltip} role="tooltip">
        {description}
      </span>
      <span className={styles.visuallyHidden} id={descriptionId}>
        {description}
      </span>
    </span>
  );
}

"use client";

import type { TranslateFn } from "@reviewo/i18n";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { OpiniaIcon } from "../../../components/opinia-icon";
import { listSoonGameVerticals } from "../../games/lib/game-profile-catalog";
import { useMyGameProfiles } from "../../games/hooks/use-my-game-profiles";
import { useTranslation } from "../../i18n/locale-provider";
import { fetchMySpotlightCredits } from "../../spotlight/api/spotlight-api";
import type { ContributionLevel } from "../../contribute/types/contribute";
import { getMyContributionProfile } from "../api/contribution";
import { getUserTrustProfile } from "../api/trust";
import type { CurrentUserProfile } from "../types/profile";
import styles from "./profile-dashboard-summary.module.css";

interface ProfileDashboardSummaryProps {
  accessToken: string;
  profile: CurrentUserProfile;
}

const NEXT_LEVEL_ACTIONS = 5;

export function ProfileDashboardSummary({ accessToken, profile }: ProfileDashboardSummaryProps) {
  const t = useTranslation();
  const contributionQuery = useQuery({
    queryFn: () => getMyContributionProfile(accessToken),
    queryKey: ["profile", "contribution", accessToken]
  });
  const trustQuery = useQuery({
    queryFn: () => getUserTrustProfile(profile.id, accessToken),
    queryKey: ["profile", "trust", profile.id, accessToken],
    retry: false
  });
  const creditsQuery = useQuery({
    queryFn: () => fetchMySpotlightCredits(accessToken),
    queryKey: ["spotlight-credits", accessToken]
  });
  const gameProfiles = useMyGameProfiles();
  const dotaProfile = gameProfiles.linkedProfiles.find((item) => item.gameId === "dota");
  const soonGames = listSoonGameVerticals();

  const contribution = contributionQuery.data;
  const trustPercent = Math.round((trustQuery.data?.trustScore ?? 0) * 100);
  const actionCount = contribution
    ? contribution.ratingsCount +
      contribution.reviewsCount +
      contribution.battleVotesCount +
      contribution.topsCount +
      contribution.entitiesCreatedCount +
      contribution.discussionsCount
    : 0;
  const levelProgress = Math.min(actionCount, NEXT_LEVEL_ACTIONS);
  const level = contribution?.level ?? "newcomer";
  const stats = [
    {
      href: "/top",
      icon: "sparkle" as const,
      label: t("web.profile.contributionRatings"),
      value: contribution?.ratingsCount ?? 0
    },
    {
      href: "/contribute",
      icon: "message" as const,
      label: t("web.profile.contributionReviews"),
      value: contribution?.reviewsCount ?? 0
    },
    {
      href: "/battles",
      icon: "battle" as const,
      label: t("web.profile.contributionBattles"),
      value: contribution?.battleVotesCount ?? 0
    },
    {
      href: "/tops",
      icon: "trophy" as const,
      label: t("web.profile.contributionTops"),
      value: contribution?.topsCount ?? 0
    },
    {
      href: "/search",
      icon: "objects" as const,
      label: t("web.profile.contributionEntities"),
      value: contribution?.entitiesCreatedCount ?? 0
    },
    {
      href: "/contribute",
      icon: "help" as const,
      label: t("web.profile.contributionFixes"),
      value: contribution?.fieldFixesCount ?? 0
    },
    {
      href: "/contribute",
      icon: "spotlight" as const,
      label: t("web.profile.contributionDiscussions"),
      value: contribution?.discussionsCount ?? 0
    }
  ];

  return (
    <div className={styles.dashboard}>
      <section className={styles.hero}>
        <div className={styles.heroIdentity}>
          <span className={styles.avatar} aria-hidden="true">
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt="" className={styles.avatarImage} src={profile.avatarUrl} />
            ) : (
              getInitials(profile.displayName)
            )}
          </span>
          <div className={styles.heroCopy}>
            <span className={styles.badge}>{formatContributionLevel(level, t)}</span>
            <h1>{profile.displayName}</h1>
            <p>{profile.email}</p>
            <div className={styles.heroTrust}>
              <div className={styles.heroTrustLabel}>
                <strong>{t("web.profile.dashboard.trustProgress")}</strong>
                <span>{trustPercent}%</span>
              </div>
              <div className={styles.progressTrack}>
                <span style={{ width: `${trustPercent}%` }} />
              </div>
              <small>{t("web.profile.dashboard.heroHint")}</small>
            </div>
            <div className={styles.heroActions}>
              <a className="button-primary" href="#profile-settings">
                {t("web.profile.dashboard.editProfile")}
              </a>
              <a className="button-secondary" href="#game-profiles">
                {t("web.profile.dashboard.gameProfiles")}
              </a>
            </div>
          </div>
        </div>
        <div className={styles.heroArtwork} aria-hidden="true">
          <span className={styles.heroOrb} />
          <span className={styles.heroShield}>
            <OpiniaIcon name="sparkle" />
          </span>
          <span className={styles.heroSparkleOne}>
            <OpiniaIcon name="sparkle" />
          </span>
          <span className={styles.heroSparkleTwo}>
            <OpiniaIcon name="sparkle" />
          </span>
        </div>
      </section>

      <nav className={styles.stats} aria-label={t("web.profile.dashboard.activityTitle")}>
        {stats.map((stat) => (
          <Link className={styles.statCard} href={stat.href} key={stat.label}>
            <span className={styles.statIcon}>
              <OpiniaIcon name={stat.icon} />
            </span>
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
            <span className={styles.statArrow} aria-hidden="true">
              ›
            </span>
          </Link>
        ))}
      </nav>

      <section className={styles.insights}>
        <article className={`${styles.insightCard} ${styles.trustCard}`}>
          <span className={styles.insightEyebrow}>{t("web.profile.dashboard.trustProgress")}</span>
          <strong className={styles.insightValue}>{trustPercent}%</strong>
          <div className={styles.progressTrack}>
            <span style={{ width: `${trustPercent}%` }} />
          </div>
          <p>{t("web.profile.dashboard.trustMin", { min: "35%" })}</p>
          <Link href="#trust">{t("web.profile.trustTitle")} ›</Link>
        </article>

        <article className={`${styles.insightCard} ${styles.levelCard}`}>
          <span className={styles.insightEyebrow}>{t("web.profile.dashboard.levelTitle")}</span>
          <div className={styles.levelIdentity}>
            <span className={styles.levelMark}>
              <OpiniaIcon name="sparkle" />
            </span>
            <strong>{formatContributionLevel(level, t)}</strong>
          </div>
          <p>
            {t("web.profile.dashboard.levelNext", {
              current: String(levelProgress),
              target: String(NEXT_LEVEL_ACTIONS)
            })}
          </p>
          <div className={styles.progressTrack}>
            <span style={{ width: `${(levelProgress / NEXT_LEVEL_ACTIONS) * 100}%` }} />
          </div>
          <Link href="/contribute">{t("web.nav.contribute")} ›</Link>
        </article>

        <article className={`${styles.insightCard} ${styles.creditsCard}`}>
          <span className={styles.insightEyebrow}>{t("web.profile.dashboard.creditsTitle")}</span>
          <strong className={styles.insightValue}>{creditsQuery.data?.balance ?? 0}</strong>
          <p>{t("web.profile.dashboard.creditsAvailable")}</p>
          <small>
            {t("web.profile.dashboard.creditsMonthly", {
              count: String(creditsQuery.data?.monthlyGrant ?? 0)
            })}
          </small>
          <Link className={styles.gradientAction} href="/spotlight">
            {t("web.profile.dashboard.openSpotlight")}
          </Link>
        </article>
      </section>

      <section className={styles.games} id="game-profiles">
        <header className={styles.sectionHeader}>
          <div>
            <h2>{t("web.profile.dashboard.gameProfiles")}</h2>
            <p>{t("web.profile.dashboard.gameProfilesHint")}</p>
          </div>
          <Link className="button-primary" href="/games">
            {t("web.profile.dashboard.createGameProfile")}
          </Link>
        </header>
        <div className={styles.gameGrid}>
          <Link
            className={`${styles.gameCard} ${styles.dotaCard}`}
            href={
              dotaProfile
                ? (gameProfiles.getProfilePath("dota", dotaProfile.slug) ?? "/dota/create")
                : (gameProfiles.getCreatePath("dota") ?? "/dota/create")
            }
          >
            <span className={styles.gameLogo}>D</span>
            <strong>Dota 2</strong>
            <span>
              {dotaProfile
                ? t("web.profile.dashboard.openDotaProfile")
                : t("web.profile.dashboard.createGameProfile")}
            </span>
          </Link>
          {/* Future: render add/edit actions when GAME_PROFILE_MANAGEMENT_UI flags are enabled. */}
          {soonGames.map((game) => (
            <div className={styles.gameCard} key={game.id}>
              <span className={styles.gameLogo}>{game.logoGlyph}</span>
              <strong>{game.title}</strong>
              <span>{t("web.profile.dashboard.comingSoon")}</span>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.activity}>
        <header className={styles.sectionHeader}>
          <div>
            <h2>{t("web.profile.dashboard.activityTitle")}</h2>
            <p>{t("web.profile.dashboard.activityHint")}</p>
          </div>
        </header>
        <div className={styles.activityGrid}>
          {stats.slice(0, 6).map((stat) => (
            <div className={styles.activityRow} key={stat.label}>
              <span className={styles.activityIcon}>
                <OpiniaIcon name={stat.icon} />
              </span>
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function formatContributionLevel(level: ContributionLevel, t: TranslateFn): string {
  return t(`web.profile.contributionLevel.${level}` as Parameters<TranslateFn>[0]);
}

function getInitials(displayName: string): string {
  return (
    displayName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "O"
  );
}

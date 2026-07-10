"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { useTranslation } from "../../i18n/locale-provider";
import type { TranslateFn } from "@reviewo/i18n";
import type { ContributionLevel } from "../../contribute/types/contribute";
import { fetchMySpotlightCredits } from "../../spotlight/api/spotlight-api";
import { fetchEditorStats } from "../../admin/api/admin-contributions-api";
import { getMyContributionProfile } from "../api/contribution";
interface ProfileContributionSectionProps {
  accessToken: string;
}

export function ProfileContributionSection({ accessToken }: ProfileContributionSectionProps) {
  const t = useTranslation();
  const contributionQuery = useQuery({
    enabled: Boolean(accessToken),
    queryFn: () => getMyContributionProfile(accessToken),
    queryKey: ["profile", "contribution", accessToken]
  });
  const editorStatsQuery = useQuery({
    enabled: Boolean(accessToken),
    queryFn: () => fetchEditorStats(accessToken),
    queryKey: ["editor-stats", accessToken]
  });
  const spotlightCreditsQuery = useQuery({
    enabled: Boolean(accessToken),
    queryFn: () => fetchMySpotlightCredits(accessToken),
    queryKey: ["spotlight-credits", accessToken]
  });

  const isLoading =
    contributionQuery.isLoading || editorStatsQuery.isLoading || spotlightCreditsQuery.isLoading;

  if (isLoading) {
    return (
      <div className="panel-card profile-panel profile-impact-panel" aria-busy="true">
        <p className="muted-copy">{t("common.loadingEllipsis")}</p>
      </div>
    );
  }

  if (contributionQuery.isError || !contributionQuery.data) {
    return null;
  }

  const profile = contributionQuery.data;
  const editorStats = editorStatsQuery.data;
  const spotlightCredits = spotlightCreditsQuery.data;
  const editorScoreLabel =
    editorStats?.editorScorePercent === null || editorStats?.editorScorePercent === undefined
      ? t("web.profile.editorScoreEmpty")
      : t("web.profile.editorScoreValue", { score: String(editorStats.editorScorePercent) });

  return (
    <div className="panel-card profile-panel profile-impact-panel">
      <div className="profile-impact-header">
        <div className="section-heading">
          <p className="result-type">{t("web.profile.contributionEyebrow")}</p>
          <h2>{t("web.profile.contributionTitle")}</h2>
        </div>
        <span className="profile-level-badge">
          {t("web.profile.contributionLevel")} {formatContributionLevel(profile.level, t)}
        </span>
      </div>

      {spotlightCredits ? (
        <div className="profile-spotlight-credits">
          <div>
            <p className="result-type">{t("web.profile.spotlightCredits")}</p>
            <p className="muted-copy">
              {t("web.profile.spotlightCreditsHint", {
                balance: String(spotlightCredits.balance),
                grant: String(spotlightCredits.monthlyGrant)
              })}
            </p>
          </div>
          <Link className="primary-link" href="/spotlight">
            {t("web.profile.spotlightLink")}
          </Link>
        </div>
      ) : null}

      <div className="profile-stat-grid">
        <ProfileStatCard label={t("web.profile.contributionRatings")} value={profile.ratingsCount} />
        <ProfileStatCard label={t("web.profile.contributionReviews")} value={profile.reviewsCount} />
        <ProfileStatCard label={t("web.profile.contributionBattles")} value={profile.battleVotesCount} />
        <ProfileStatCard label={t("web.profile.contributionTops")} value={profile.topsCount} />
        <ProfileStatCard
          label={t("web.profile.contributionEntities")}
          value={profile.entitiesCreatedCount}
        />
        <ProfileStatCard label={t("web.profile.contributionFixes")} value={profile.fieldFixesCount} />
        <ProfileStatCard
          label={t("web.profile.contributionDiscussions")}
          value={profile.discussionsCount}
        />
      </div>

      {editorStats ? (
        <div className="profile-impact-subsection">
          <div className="profile-impact-subsection-heading">
            <p className="result-type">{t("web.profile.editorStatsEyebrow")}</p>
            <h3>{t("web.profile.editorStatsTitle")}</h3>
          </div>

          <div className="profile-stat-grid profile-stat-grid-compact">
            <ProfileStatCard
              compact
              label={t("web.profile.editorStatsSubmitted")}
              value={editorStats.totalSubmitted}
            />
            <ProfileStatCard
              compact
              label={t("web.profile.editorStatsApplied")}
              value={editorStats.appliedCount}
            />
            <ProfileStatCard
              compact
              label={t("web.profile.editorStatsRejected")}
              value={editorStats.rejectedCount}
            />
            <ProfileStatCard
              compact
              label={t("web.profile.editorStatsPending")}
              value={editorStats.pendingCount}
            />
            <ProfileStatCard compact label={t("web.profile.editorStatsScore")} value={editorScoreLabel} />
          </div>
        </div>
      ) : null}

      {profile.badges.length > 0 ? (
        <div className="profile-impact-subsection">
          <div className="profile-impact-subsection-heading">
            <p className="result-type">{t("web.profile.badgesEyebrow")}</p>
            <h3>{t("web.profile.badgesTitle")}</h3>
          </div>
          <div className="profile-badge-list">
            {profile.badges.map((badge) => (
              <span className="profile-badge-chip" key={badge}>
                {formatContributionBadge(badge, t)}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {profile.expertise.length > 0 ? (
        <div className="profile-impact-subsection">
          <div className="profile-impact-subsection-heading">
            <p className="result-type">{t("web.profile.expertiseEyebrow")}</p>
            <h3>{t("web.profile.expertiseTitle")}</h3>
          </div>
          <ul className="profile-meta-list">
            {profile.expertise.map((area) => (
              <li key={`${area.scopeType}-${area.scopeKey}`}>
                {formatExpertiseArea(area, t)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {profile.curatorRanks.length > 0 ? (
        <div className="profile-impact-subsection">
          <div className="profile-impact-subsection-heading">
            <p className="result-type">{t("web.profile.curatorRankEyebrow")}</p>
            <h3>{t("web.profile.curatorRankTitle")}</h3>
          </div>
          <ul className="profile-meta-list">
            {profile.curatorRanks.map((rank) => (
              <li key={rank.categoryId}>
                {rank.categoryTitle ?? rank.categorySlug ?? rank.categoryId}
                {": "}
                {rank.score}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function ProfileStatCard({
  compact = false,
  label,
  value
}: {
  compact?: boolean;
  label: string;
  value: number | string;
}) {
  return (
    <div className={compact ? "profile-stat-card is-compact" : "profile-stat-card"}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatContributionLevel(level: ContributionLevel, t: TranslateFn): string {
  switch (level) {
    case "newcomer":
      return t("web.profile.contributionLevel.newcomer");
    case "contributor":
      return t("web.profile.contributionLevel.contributor");
    case "active_contributor":
      return t("web.profile.contributionLevel.active_contributor");
    case "curator":
      return t("web.profile.contributionLevel.curator");
    case "pioneer":
      return t("web.profile.contributionLevel.pioneer");
    default:
      return level;
  }
}

function formatContributionBadge(badge: string, t: TranslateFn): string {
  const key = `web.profile.badge.${badge}` as Parameters<TranslateFn>[0];
  const translated = t(key);
  return translated === key ? badge : translated;
}

function formatExpertiseArea(
  area: { scopeKey: string; scopeType: "category" | "entity_type"; score: number },
  t: TranslateFn
): string {
  if (area.scopeType === "entity_type") {
    return t("web.profile.expertiseEntityType", {
      score: String(area.score),
      type: area.scopeKey
    });
  }

  return t("web.profile.expertiseCategory", {
    category: area.scopeKey,
    score: String(area.score)
  });
}

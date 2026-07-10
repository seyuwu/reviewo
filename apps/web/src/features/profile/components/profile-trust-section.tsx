"use client";

import { useQuery } from "@tanstack/react-query";

import { ApiError } from "../../../lib/api/api-error";
import { useTranslation } from "../../i18n/locale-provider";
import { fetchSpotlightCosts } from "../../spotlight/api/spotlight-api";
import { getUserTrustProfile } from "../api/trust";

interface ProfileTrustSectionProps {
  accessToken: string;
  userId: string;
}

export function ProfileTrustSection({ accessToken, userId }: ProfileTrustSectionProps) {
  const t = useTranslation();

  const costsQuery = useQuery({
    queryFn: fetchSpotlightCosts,
    queryKey: ["spotlight-costs"]
  });

  const trustQuery = useQuery({
    enabled: Boolean(accessToken && userId),
    queryFn: () => getUserTrustProfile(userId, accessToken),
    queryKey: ["profile", "trust", userId, accessToken],
    retry: false
  });

  const minTrustScore = costsQuery.data?.minTrustScore ?? 0.35;
  const minTrustPercent = formatTrustPercent(minTrustScore);
  const isMissing = trustQuery.isError && trustQuery.error instanceof ApiError && trustQuery.error.status === 404;
  const trustScore = trustQuery.data?.trustScore;
  const trustPercent = trustScore === undefined ? null : formatTrustPercent(trustScore);
  const isBelowMinimum = trustScore !== undefined && trustScore < minTrustScore;

  return (
    <div
      className={`panel-card profile-panel profile-trust-panel${isBelowMinimum ? " is-low-trust" : ""}`}
      id="trust"
    >
      <header className="section-heading">
        <p className="result-type">{t("web.profile.trustEyebrow")}</p>
        <h2>{t("web.profile.trustTitle")}</h2>
        <p className="muted-copy">{t("web.profile.trustSubtitle", { min: minTrustPercent })}</p>
      </header>

      {trustQuery.isLoading ? <p className="muted-copy">{t("common.loadingEllipsis")}</p> : null}

      {isMissing ? (
        <p className="muted-copy">{t("web.profile.trustMissing")}</p>
      ) : null}

      {!trustQuery.isLoading && !isMissing && trustPercent ? (
        <>
          <div className="profile-trust-score-row">
            <span className="profile-trust-score-label">{t("web.profile.trustScoreLabel")}</span>
            <strong className={`profile-trust-score-value${isBelowMinimum ? " is-low" : ""}`}>
              {trustPercent}
            </strong>
          </div>

          {isBelowMinimum ? (
            <p className="profile-trust-warning">{t("web.profile.trustBelowMinimum", { min: minTrustPercent })}</p>
          ) : (
            <p className="muted-copy">{t("web.profile.trustSpotlightReady")}</p>
          )}

          {trustQuery.data ? (
            <dl className="profile-trust-metrics">
              <div>
                <dt>{t("web.profile.trustRatings")}</dt>
                <dd>{trustQuery.data.behaviorSummary.totalRatings}</dd>
              </div>
              <div>
                <dt>{t("web.profile.trustEntities")}</dt>
                <dd>{trustQuery.data.behaviorSummary.uniqueEntities}</dd>
              </div>
              <div>
                <dt>{t("web.profile.trustDomains")}</dt>
                <dd>{trustQuery.data.behaviorSummary.uniqueRootDomains}</dd>
              </div>
            </dl>
          ) : null}
        </>
      ) : null}

      {!trustQuery.isLoading && trustQuery.isError && !isMissing ? (
        <p className="muted-copy">{t("web.profile.trustLoadError")}</p>
      ) : null}
    </div>
  );
}

function formatTrustPercent(score: number): string {
  return `${Math.round(score * 100)}%`;
}

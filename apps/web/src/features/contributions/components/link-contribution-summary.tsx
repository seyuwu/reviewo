"use client";

import { useQuery } from "@tanstack/react-query";

import { useTranslation } from "../../i18n/locale-provider";
import { fetchEntityTitle } from "../api/entity-title-api";

interface LinkContributionPayload {
  reason?: string;
  relatedEntityId: string;
  relatedEntityTitle?: string | null;
}

interface LinkContributionSummaryProps {
  payload: unknown;
}

export function LinkContributionSummary({ payload }: LinkContributionSummaryProps) {
  const t = useTranslation();

  if (!isLinkContributionPayload(payload)) {
    return <p className="contribution-pending-value">{t("contributions.unknownChange")}</p>;
  }

  const relatedTitleFromPayload = payload.relatedEntityTitle?.trim() ?? "";
  const relatedQuery = useQuery({
    enabled: !relatedTitleFromPayload,
    queryFn: () => fetchEntityTitle(payload.relatedEntityId),
    queryKey: ["entity-title", payload.relatedEntityId]
  });
  const relatedTitle =
    relatedTitleFromPayload || relatedQuery.data || t("common.loadingEllipsis");

  return (
    <p className="contribution-pending-value">
      {t("contributions.linkSummary", { relatedTitle })}
    </p>
  );
}

function isLinkContributionPayload(payload: unknown): payload is LinkContributionPayload {
  return typeof payload === "object" && payload !== null && "relatedEntityId" in payload;
}

"use client";

import { useQuery } from "@tanstack/react-query";

import { useTranslation } from "../../i18n/locale-provider";
import { fetchEntityTitle } from "../api/entity-title-api";

interface MergeContributionPayload {
  sourceEntityId: string;
  sourceEntityTitle?: string | null;
  targetEntityId: string;
  targetEntityTitle?: string | null;
}

interface MergeContributionSummaryProps {
  currentEntity: {
    id: string;
    title: string;
  };
  payload: unknown;
}

export function MergeContributionSummary({ currentEntity, payload }: MergeContributionSummaryProps) {
  const t = useTranslation();

  if (!isMergeContributionPayload(payload)) {
    return <p className="contribution-pending-value">{t("contributions.unknownChange")}</p>;
  }

  const sourceTitleFromPayload = payload.sourceEntityTitle?.trim() ?? "";
  const targetTitleFromPayload = payload.targetEntityTitle?.trim() ?? "";
  const sourceFromCurrent = payload.sourceEntityId === currentEntity.id ? currentEntity.title : "";
  const targetFromCurrent = payload.targetEntityId === currentEntity.id ? currentEntity.title : "";

  const sourceQuery = useQuery({
    enabled: !sourceTitleFromPayload && !sourceFromCurrent,
    queryFn: () => fetchEntityTitle(payload.sourceEntityId),
    queryKey: ["entity-title", payload.sourceEntityId]
  });
  const targetQuery = useQuery({
    enabled: !targetTitleFromPayload && !targetFromCurrent,
    queryFn: () => fetchEntityTitle(payload.targetEntityId),
    queryKey: ["entity-title", payload.targetEntityId]
  });

  const sourceTitle =
    sourceTitleFromPayload || sourceFromCurrent || sourceQuery.data || t("common.loadingEllipsis");
  const targetTitle =
    targetTitleFromPayload || targetFromCurrent || targetQuery.data || t("common.loadingEllipsis");

  return (
    <p className="contribution-pending-value">
      {t("contributions.mergeSummary", { sourceTitle, targetTitle })}
    </p>
  );
}

function isMergeContributionPayload(payload: unknown): payload is MergeContributionPayload {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "sourceEntityId" in payload &&
    "targetEntityId" in payload
  );
}

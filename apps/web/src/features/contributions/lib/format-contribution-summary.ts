import type { TranslateFn } from "@reviewo/i18n";

import type { Contribution, ContributionType } from "../types/contributions";

interface MergeContributionPayload {
  reason?: string;
  sourceEntityId: string;
  sourceEntityTitle?: string | null;
  targetEntityId: string;
  targetEntityTitle?: string | null;
}

export function formatContributionSummary(
  t: TranslateFn,
  contribution: Pick<Contribution, "payload" | "type">
): string {
  if (contribution.type === "MERGE_ENTITY") {
    const payload = contribution.payload as MergeContributionPayload;

    return t("contributions.mergeSummary", {
      sourceTitle: payload.sourceEntityTitle?.trim() || payload.sourceEntityId,
      targetTitle: payload.targetEntityTitle?.trim() || payload.targetEntityId
    });
  }

  if (contribution.type === "LINK_ENTITY" || contribution.type === "UNLINK_ENTITY") {
    const payload = contribution.payload as {
      relatedEntityId: string;
      relatedEntityTitle?: string | null;
    };

    return t(
      contribution.type === "UNLINK_ENTITY"
        ? "contributions.unlinkSummary"
        : "contributions.linkSummary",
      {
        relatedTitle: payload.relatedEntityTitle?.trim() || payload.relatedEntityId
      }
    );
  }

  const payload = contribution.payload as { newValue?: string; oldValue?: string | null };

  if (payload.newValue?.trim()) {
    if (payload.oldValue?.trim()) {
      return t("contributions.fieldChangeSummary", {
        newValue: payload.newValue,
        oldValue: payload.oldValue
      });
    }

    return payload.newValue;
  }

  return t("contributions.unknownChange");
}

export function isMergeContributionType(type: ContributionType): type is "MERGE_ENTITY" {
  return type === "MERGE_ENTITY";
}

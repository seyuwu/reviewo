import type { MessageKey, TranslateFn } from "@reviewo/i18n";

import type { ContributionType } from "../contributions/types/contributions";

const CONTRIBUTION_TYPE_KEYS: Record<ContributionType, MessageKey> = {
  LINK_ENTITY: "contributions.type.LINK_ENTITY",
  UNLINK_ENTITY: "contributions.type.UNLINK_ENTITY",
  MERGE_ENTITY: "contributions.type.MERGE_ENTITY",
  UPDATE_DESCRIPTION: "contributions.type.UPDATE_DESCRIPTION",
  UPDATE_LOGO: "contributions.type.UPDATE_LOGO",
  UPDATE_NAME: "contributions.type.UPDATE_NAME",
  UPDATE_TYPE: "contributions.type.UPDATE_TYPE",
  UPDATE_URL: "contributions.type.UPDATE_URL"
};

export function formatContributionTypeLabel(t: TranslateFn, type: ContributionType): string {
  const key = CONTRIBUTION_TYPE_KEYS[type];

  if (!key) {
    return type;
  }

  return t(key);
}

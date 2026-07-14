import type { TranslateFn } from "@reviewo/i18n";
import { DOTA_FLAG_LIMIT_PER_SIDE } from "@reviewo/shared";

import { isApiError, readApiErrorMessage } from "../../../lib/api/read-api-error";

export function resolveDotaConfirmError(error: unknown, t: TranslateFn): string {
  if (!isApiError(error)) {
    return t("dota.confirm.error");
  }

  if (error.status === 403) {
    return t("dota.confirm.selfConfirm");
  }

  if (error.status === 429) {
    return t("dota.confirm.rateLimit");
  }

  const apiMessage = readApiErrorMessage(error.body);

  if (apiMessage?.toLowerCase().includes("green and")) {
    return t("dota.flags.limitGeneric", { limit: String(DOTA_FLAG_LIMIT_PER_SIDE) });
  }

  if (apiMessage) {
    return apiMessage;
  }

  return t("dota.confirm.error");
}

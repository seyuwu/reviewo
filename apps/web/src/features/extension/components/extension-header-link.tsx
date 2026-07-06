"use client";

import { publicEnv } from "../../../lib/config/public-env";
import { useTranslation } from "../../i18n/locale-provider";
import { useReviewoExtensionPresence } from "../lib/use-reviewo-extension-presence";

export function ExtensionHeaderLink() {
  const t = useTranslation();
  const isExtensionInstalled = useReviewoExtensionPresence();
  const installUrl = publicEnv.extensionInstallUrl;

  if (isExtensionInstalled || !installUrl) {
    return null;
  }

  return (
    <a
      className="app-activity-link extension-header-link"
      href={installUrl}
      rel="noopener noreferrer"
      target="_blank"
      title={t("web.extensionCta.headerTitle")}
    >
      <span className="app-activity-icon" aria-hidden="true">
        🧩
      </span>
      <span className="app-activity-copy">
        <span className="app-activity-label app-activity-label-only">{t("web.extensionCta.headerLabel")}</span>
      </span>
    </a>
  );
}

"use client";

import { publicEnv } from "../../../lib/config/public-env";
import { OpiniaIcon } from "../../../components/opinia-icon";
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
      className="app-chrome-nav-link app-chrome-nav-link--extension extension-header-link"
      href={installUrl}
      rel="noopener noreferrer"
      target="_blank"
      title={t("web.extensionCta.headerTitle")}
    >
      <span className="app-chrome-nav-icon app-chrome-nav-icon--extension" aria-hidden="true">
        <OpiniaIcon className="app-chrome-nav-icon-svg" name="extension" />
      </span>
      <span>{t("web.extensionCta.headerLabel")}</span>
    </a>
  );
}

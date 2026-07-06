"use client";

import { useEffect, useState } from "react";

import { publicEnv } from "../../../lib/config/public-env";
import { useTranslation } from "../../i18n/locale-provider";
import { useReviewoExtensionPresence } from "../lib/use-reviewo-extension-presence";

const DISMISS_STORAGE_KEY = "reviewo.extensionHomeBannerDismissed";

export function ExtensionHomeBanner() {
  const t = useTranslation();
  const isExtensionInstalled = useReviewoExtensionPresence();
  const installUrl = publicEnv.extensionInstallUrl;
  const [isDismissed, setIsDismissed] = useState(true);

  useEffect(() => {
    setIsDismissed(window.localStorage.getItem(DISMISS_STORAGE_KEY) === "1");
  }, []);

  if (isExtensionInstalled || !installUrl || isDismissed) {
    return null;
  }

  return (
    <aside className="extension-home-banner" aria-label={t("web.extensionCta.homeBannerAriaLabel")}>
      <p className="extension-home-banner-copy">{t("web.extensionCta.homeBanner")}</p>
      <div className="extension-home-banner-actions">
        <a
          className="extension-home-banner-cta"
          href={installUrl}
          rel="noopener noreferrer"
          target="_blank"
        >
          {t("web.extensionCta.action")}
        </a>
        <button
          type="button"
          className="extension-home-banner-dismiss"
          onClick={() => {
            window.localStorage.setItem(DISMISS_STORAGE_KEY, "1");
            setIsDismissed(true);
          }}
        >
          {t("web.extensionCta.homeBannerDismiss")}
        </button>
      </div>
    </aside>
  );
}

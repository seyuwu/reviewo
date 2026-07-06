"use client";

import { publicEnv } from "../../../lib/config/public-env";
import { useTranslation } from "../../i18n/locale-provider";
import { useReviewoExtensionPresence } from "../lib/use-reviewo-extension-presence";

interface ExtensionEntityCtaProps {
  className?: string | undefined;
}

export function ExtensionEntityCta({ className }: ExtensionEntityCtaProps) {
  const t = useTranslation();
  const isExtensionInstalled = useReviewoExtensionPresence();
  const installUrl = publicEnv.extensionInstallUrl;

  if (isExtensionInstalled) {
    return null;
  }

  return (
    <aside
      className={["panel-card extension-cta", className].filter(Boolean).join(" ")}
      aria-label={t("web.extensionCta.ariaLabel")}
    >
      <div className="section-heading">
        <p className="result-type">{t("web.extensionCta.eyebrow")}</p>
        <h2>{t("web.extensionCta.entityTitle")}</h2>
      </div>
      <p className="muted-copy">{t("web.extensionCta.entityBody")}</p>
      {installUrl ? (
        <a className="primary-link" href={installUrl} rel="noopener noreferrer" target="_blank">
          {t("web.extensionCta.action")}
        </a>
      ) : (
        <p className="muted-copy extension-cta-note">{t("web.extensionCta.noInstallUrl")}</p>
      )}
    </aside>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { publicEnv } from "../../../lib/config/public-env";
import { useTranslation } from "../../i18n/locale-provider";
import { useReviewoExtensionPresence } from "../../extension/lib/use-reviewo-extension-presence";

export function HomeBottomCta() {
  const t = useTranslation();
  const isExtensionInstalled = useReviewoExtensionPresence();
  const installUrl = publicEnv.extensionInstallUrl;
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const showExtensionCta = isMounted && !isExtensionInstalled && Boolean(installUrl);

  return (
    <aside className="home-bottom-cta" aria-label={t("web.homeFeed.bottomCtaAriaLabel")}>
      <p className="home-bottom-cta-copy">
        <strong>{t("web.homeFeed.bottomCtaTitle")}</strong>
        <span>{t("web.homeFeed.bottomCtaSubtitle")}</span>
      </p>
      <div className="home-bottom-cta-actions">
        <Link
          className="home-bottom-cta-primary"
          data-analytics="home_create_entity"
          href="/entities/new"
        >
          {t("web.entityCreate.createEntity")}
        </Link>
        {showExtensionCta ? (
          <a
            className="home-bottom-cta-secondary"
            href={installUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            <ExtensionIcon />
            {t("web.extensionCta.action")}
          </a>
        ) : null}
      </div>
    </aside>
  );
}

function ExtensionIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 20 20" width="16">
      <path
        d="M6.5 3.5h7a1 1 0 0 1 1 1v3h2.5a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5H4.5A1.5 1.5 0 0 1 3 14.5v-5A1.5 1.5 0 0 1 4.5 8H7v-3.5a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

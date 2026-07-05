"use client";

import Link from "next/link";

import { useTranslation } from "../features/i18n/locale-provider";

export function SiteFooter() {
  const t = useTranslation();

  return (
    <footer className="site-footer" aria-label={t("web.footer.ariaLabel")}>
      <div className="site-footer-inner">
        <Link className="site-footer-link" href="/privacy">
          {t("web.footer.privacy")}
        </Link>
      </div>
    </footer>
  );
}

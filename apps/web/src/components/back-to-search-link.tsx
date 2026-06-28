"use client";

import Link from "next/link";

import { useTranslation } from "../features/i18n/locale-provider";

interface BackToSearchLinkProps {
  query?: string | undefined;
}

export function BackToSearchLink({ query }: BackToSearchLinkProps) {
  const t = useTranslation();
  const trimmed = query?.trim() ?? "";
  const href = trimmed ? `/?q=${encodeURIComponent(trimmed)}` : "/";

  return (
    <nav className="entity-page-toolbar entity-page-toolbar-prominent" aria-label="Page navigation">
      <Link className="entity-back-button" href={href}>
        ← {t("web.backToSearch")}
      </Link>
    </nav>
  );
}

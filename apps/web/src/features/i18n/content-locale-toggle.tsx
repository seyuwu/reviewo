"use client";

import type { AppLocale } from "@reviewo/i18n";

import { useTranslation } from "./locale-provider";

interface ContentLocaleToggleProps {
  locale: AppLocale;
  onToggle: () => void;
  showAll: boolean;
}

export function ContentLocaleToggle({ locale, onToggle, showAll }: ContentLocaleToggleProps) {
  const t = useTranslation();

  return (
    <button type="button" className="button-secondary" onClick={onToggle}>
      {showAll
        ? t("web.locale.showLocaleOnly", {
            locale: locale === "ru" ? t("locale.ru") : t("locale.en")
          })
        : t("web.locale.showAllLanguages")}
    </button>
  );
}

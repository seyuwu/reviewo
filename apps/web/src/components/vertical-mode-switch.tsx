"use client";

import Link from "next/link";

import { useTranslation } from "../features/i18n/locale-provider";

interface VerticalModeSwitchProps {
  mode: "games" | "opinia";
}

export function VerticalModeSwitch({ mode }: VerticalModeSwitchProps) {
  const t = useTranslation();

  return (
    <div aria-label={t("web.vertical.switchAriaLabel")} className="vertical-mode-switch" role="group">
      <Link
        aria-current={mode === "opinia" ? "page" : undefined}
        className={`vertical-mode-switch-link${mode === "opinia" ? " is-active" : ""}`}
        href="/"
      >
        {t("web.vertical.opinia")}
      </Link>
      <Link
        aria-current={mode === "games" ? "page" : undefined}
        className={`vertical-mode-switch-link${mode === "games" ? " is-active" : ""}`}
        href="/games"
      >
        {t("web.vertical.games")}
      </Link>
    </div>
  );
}

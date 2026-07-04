"use client";

import type { EntityChatLocale } from "@reviewo/shared";
import { ENTITY_CHAT_LOCALES } from "@reviewo/shared";

import { useTranslation } from "../../i18n/locale-provider";
import styles from "./entity-chat-locale-switch.module.css";

interface EntityChatLocaleSwitchProps {
  locale: EntityChatLocale;
  onChange: (locale: EntityChatLocale) => void;
}

function localeOptionTitle(t: ReturnType<typeof useTranslation>, value: EntityChatLocale): string {
  return value === "ru" ? t("locale.ru") : t("locale.en");
}

export function EntityChatLocaleSwitch({ locale, onChange }: EntityChatLocaleSwitchProps) {
  const t = useTranslation();

  return (
    <div className={styles.localeSwitch} role="group" aria-label={t("locale.label")}>
      {ENTITY_CHAT_LOCALES.map((option) => (
        <button
          key={option}
          type="button"
          className={`${styles.localeButton}${option === locale ? ` ${styles.localeButtonActive}` : ""}`}
          aria-pressed={option === locale}
          title={localeOptionTitle(t, option)}
          onClick={() => {
            if (option !== locale) {
              onChange(option);
            }
          }}
        >
          {option.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

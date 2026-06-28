import type { AppLocale } from "./locale.js";
import { enMessages, type MessageKey } from "./messages/en.js";
import { ruMessages } from "./messages/ru.js";
const messageCatalogs: Record<AppLocale, Record<MessageKey, string>> = {
  en: enMessages,
  ru: ruMessages
};

export type TranslateParams = Record<string, string | number>;

export type TranslateFn = (key: MessageKey, params?: TranslateParams) => string;

export function createTranslator(locale: AppLocale): TranslateFn {
  const messages = messageCatalogs[locale];

  return (key, params) => {
    const template = messages[key] ?? messageCatalogs.en[key] ?? key;
    return interpolate(template, params);
  };
}

export function formatRatingVotesLabel(t: TranslateFn, count: number): string {
  return count === 1 ? t("rating.votesCount.one") : t("rating.votesCount.other", { count });
}

function interpolate(template: string, params?: TranslateParams): string {
  if (!params) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = params[key];

    if (value === undefined) {
      return match;
    }

    return String(value);
  });
}

export { enMessages, ruMessages };
export type { MessageKey };

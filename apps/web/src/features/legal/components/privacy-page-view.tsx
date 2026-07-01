"use client";

import type { MessageKey } from "@reviewo/i18n";

import { useTranslation } from "../../i18n/locale-provider";

const sectionKeys = [
  "operator",
  "collect",
  "use",
  "extension",
  "sharing",
  "retention",
  "security",
  "rights",
  "children",
  "changes"
] as const;

type PrivacySectionKey = (typeof sectionKeys)[number];

function sectionMessageKey(section: PrivacySectionKey, part: "title" | "body"): MessageKey {
  return `web.privacy.sections.${section}.${part}`;
}

export function PrivacyPageView() {
  const t = useTranslation();

  return (
    <article className="legal-page">
      <header className="legal-page-header">
        <p className="legal-page-eyebrow">{t("brand.name")}</p>
        <h1>{t("web.privacy.title")}</h1>
        <p className="legal-page-updated">{t("web.privacy.updated")}</p>
        <p className="legal-page-intro">{t("web.privacy.intro")}</p>
      </header>

      <div className="legal-page-sections">
        {sectionKeys.map((key) => (
          <section key={key} className="legal-page-section">
            <h2>{t(sectionMessageKey(key, "title"))}</h2>
            <p>{t(sectionMessageKey(key, "body"))}</p>
          </section>
        ))}
      </div>

      <footer className="legal-page-contact">
        <h2>{t("web.privacy.contact.title")}</h2>
        <p>{t("web.privacy.contact.body")}</p>
      </footer>
    </article>
  );
}

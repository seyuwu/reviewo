"use client";

import Link from "next/link";

import { useTranslation } from "../../i18n/locale-provider";
import type { EntityTopAppearance } from "../types/tops";

interface EntityTopsSectionProps {
  items: EntityTopAppearance[];
}

function getTopHref(item: EntityTopAppearance): string {
  return item.isSystemTop ? `/top/${item.slug}` : `/tops/${item.slug}`;
}

function getTopKey(item: EntityTopAppearance): string {
  return item.isSystemTop ? `system-${item.slug}` : item.topId ?? item.slug;
}

export function EntityTopsSection({ items }: EntityTopsSectionProps) {
  const t = useTranslation();

  if (items.length === 0) {
    return null;
  }

  return (
    <section id="entity-user-tops" className="entity-section" aria-labelledby="entity-user-tops-heading">
      <div className="panel-card">
        <header className="panel-header">
          <h2 id="entity-user-tops-heading">{t("web.userTops.entitySectionTitle")}</h2>
        </header>

        <ul className="discovery-rank-list">
          {items.map((item) => (
            <li key={getTopKey(item)}>
              <Link className="discovery-rank-item" href={getTopHref(item)}>
                <span className="discovery-rank-item-main">
                  <span className="discovery-rank-position">{item.position}</span>
                  <span>
                    <strong>{item.title}</strong>
                    {item.isSystemTop ? (
                      <span className="muted-copy discovery-rank-score">
                        {t("web.systemTops.entitySectionBadge")}
                      </span>
                    ) : null}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

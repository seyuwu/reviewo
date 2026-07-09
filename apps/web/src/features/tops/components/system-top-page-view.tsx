"use client";

import Link from "next/link";

import { EntityAvatar } from "../../entities/components/entity-avatar";
import { formatEntityDisplayName } from "../../growth/lib/format-entity-display-name";
import { formatScoreOneDecimal } from "../../growth/lib/format-growth-stats";
import { useTranslation } from "../../i18n/locale-provider";
import type { SystemTopDetail } from "../types/tops";

interface SystemTopPageViewProps {
  top: SystemTopDetail;
}

export function SystemTopPageView({ top }: SystemTopPageViewProps) {
  const t = useTranslation();

  return (
    <div className="home-hub">
      <section className="home-hub-card" aria-labelledby="system-top-page-heading">
        <header className="home-hub-header">
          <p className="eyebrow">{t("web.systemTops.pageEyebrow")}</p>
          <h1 id="system-top-page-heading">{top.title}</h1>
          {top.description ? <p className="home-hub-subtitle">{top.description}</p> : null}
          {top.computedAt ? (
            <p className="muted-copy">
              {t("web.systemTops.computedAt", {
                date: new Date(top.computedAt).toLocaleString()
              })}
            </p>
          ) : null}
        </header>

        <div className="panel-card">
          {top.items.length > 0 ? (
            <ol className="discovery-rank-list">
              {top.items.map((item) => {
                const label = formatEntityDisplayName(item.entity);

                return (
                  <li key={item.entity.id}>
                    <div className="discovery-rank-item">
                      <span className="discovery-rank-item-main">
                        <span className="discovery-rank-position">{item.position}</span>
                        <EntityAvatar
                          canonicalUrl={item.entity.canonicalUrl}
                          entityId={item.entity.id}
                          logoUrl={item.entity.logoUrl}
                          size="sm"
                          title={label}
                        />
                        <span>
                          <Link href={`/entities/${item.entity.id}`}>
                            <strong>{label}</strong>
                          </Link>
                          {item.avgScore !== null && item.votesCount !== null ? (
                            <span className="muted-copy discovery-rank-score">
                              {formatScoreOneDecimal(item.avgScore)} ·{" "}
                              {t("search.canonical.ratings", { count: item.votesCount })}
                            </span>
                          ) : null}
                        </span>
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="muted-copy">{t("web.systemTops.emptyItems")}</p>
          )}
        </div>
      </section>
    </div>
  );
}

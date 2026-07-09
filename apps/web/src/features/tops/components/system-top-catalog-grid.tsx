"use client";

import Link from "next/link";

import { useTranslation } from "../../i18n/locale-provider";
import type { SystemTopCatalogItem } from "../types/tops";

interface SystemTopCatalogGridProps {
  items: SystemTopCatalogItem[];
}

export function SystemTopCatalogGrid({ items }: SystemTopCatalogGridProps) {
  const t = useTranslation();

  if (items.length === 0) {
    return <p className="muted-copy">{t("web.systemTops.emptyItems")}</p>;
  }

  return (
    <ul className="system-top-catalog-grid">
      {items.map((item) => (
        <li key={item.slug}>
          <Link className="system-top-catalog-card" href={`/top/${item.slug}`}>
            <strong>{item.title}</strong>
            {item.description ? <p className="muted-copy">{item.description}</p> : null}
            {item.computedAt ? (
              <p className="muted-copy system-top-catalog-meta">
                {t("web.topsPage.catalogUpdated", {
                  date: new Date(item.computedAt).toLocaleString()
                })}
              </p>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}

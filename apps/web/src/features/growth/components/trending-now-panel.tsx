"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useTranslation } from "../../i18n/locale-provider";
import { fetchActiveNow } from "../api/active-now";
import type { ActiveNowItem } from "../types/growth";

export function TrendingNowPanel() {
  const t = useTranslation();
  const [items, setItems] = useState<ActiveNowItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void fetchActiveNow(8)
      .then((response) => {
        if (cancelled) {
          return;
        }

        setItems(response.items);
      })
      .catch(() => {
        if (!cancelled) {
          setIsVisible(false);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!isVisible && !isLoading) {
    return null;
  }

  return (
    <section className="growth-trending-panel" aria-labelledby="growth-trending-heading">
      <div className="growth-section-heading">
        <h2 id="growth-trending-heading">{t("chat.activeNow.title")}</h2>
      </div>

      {isLoading ? (
        <p className="muted-copy">{t("chat.loading")}</p>
      ) : items.length === 0 ? (
        <p className="muted-copy">{t("chat.activeNow.empty")}</p>
      ) : (
        <ul className="growth-trending-list">
          {items.map((item) => (
            <li key={item.entityId}>
              <Link className="growth-trending-item" href={`/entities/${item.entityId}`}>
                <span className="growth-trending-item-main">
                  <strong>{item.entityTitle}</strong>
                  <span className="muted-copy">
                    {item.previewMessage ?? t("growth.trending.viewAll")}
                  </span>
                </span>
                <span className="growth-trending-item-meta">
                  {t("chat.activeNow.online", { count: String(item.onlineCount) })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

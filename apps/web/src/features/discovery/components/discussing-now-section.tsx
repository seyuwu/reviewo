"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { fetchActiveNow } from "../../growth/api/active-now";
import type { ActiveNowItem } from "../../growth/types/growth";
import { useTranslation } from "../../i18n/locale-provider";
import { FeedSection } from "./feed-section";

export function DiscussingNowSection() {
  const t = useTranslation();
  const [items, setItems] = useState<ActiveNowItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void fetchActiveNow(6)
      .then((response) => {
        if (!cancelled) {
          setItems(response.items);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setItems([]);
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

  return (
    <FeedSection heading={t("web.homeFeed.sectionDiscussing")} headingId="home-feed-discussing">
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
    </FeedSection>
  );
}

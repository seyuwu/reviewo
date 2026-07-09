"use client";

import Link from "next/link";

import { formatTopCategoryLabel } from "../../i18n/top-category-label";
import { useTranslation } from "../../i18n/locale-provider";
import type { TopListItem } from "../types/tops";

interface TopsListProps {
  emptyMessage: string;
  items: TopListItem[];
  showAuthor?: boolean;
  showCategory?: boolean;
  showEngagement?: boolean;
}

export function TopsList({
  emptyMessage,
  items,
  showAuthor = true,
  showCategory = true,
  showEngagement = false
}: TopsListProps) {
  const t = useTranslation();

  if (items.length === 0) {
    return <p className="muted-copy">{emptyMessage}</p>;
  }

  return (
    <ul className="discovery-rank-list">
      {items.map((item) => (
        <li key={item.id}>
          <Link className="discovery-rank-item" href={`/tops/${item.slug}`}>
            <span className="discovery-rank-item-main">
              <span>
                <strong>{item.title}</strong>
                <span className="muted-copy discovery-rank-score">
                  {showAuthor
                    ? t("web.userTops.listMeta", {
                        author: item.author.displayName,
                        count: String(item.itemCount)
                      })
                    : t("web.profile.myTopsMeta", { count: String(item.itemCount) })}
                  {!showCategory || !item.category
                    ? ""
                    : ` · ${formatTopCategoryLabel(t, item.category.slug, item.category.title)}`}
                  {showEngagement
                    ? ` · ${t("web.userTops.listEngagementMeta", {
                        comments: String(item.commentsCount ?? 0),
                        forks: String(item.forksCount ?? 0),
                        likes: String(item.likesCount ?? 0),
                        views: String(item.viewsCount ?? 0)
                      })}`
                    : null}
                </span>
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

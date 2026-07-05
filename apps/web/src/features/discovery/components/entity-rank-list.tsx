import Link from "next/link";

import { formatEntityDisplayName } from "../../growth/lib/format-entity-display-name";
import { useTranslation } from "../../i18n/locale-provider";
import type { DiscoveryEntityRankItem } from "../types/discovery";

interface EntityRankListProps {
  items: DiscoveryEntityRankItem[];
  showRecentVotes?: boolean;
}

export function EntityRankList({ items, showRecentVotes = false }: EntityRankListProps) {
  const t = useTranslation();

  if (items.length === 0) {
    return null;
  }

  return (
    <ul className="discovery-rank-list">
      {items.map((item, index) => {
        const label = formatEntityDisplayName({
          canonicalUrl: null,
          slug: item.slug,
          title: item.title
        });

        return (
          <li key={item.entityId}>
            <Link className="discovery-rank-item" href={`/entities/${item.entityId}`}>
              <span className="discovery-rank-item-main">
                <span className="discovery-rank-position">{index + 1}</span>
                <span>
                  <strong>{label}</strong>
                  <span className="muted-copy discovery-rank-score">
                    {item.avgScore.toFixed(1)} · {t("search.canonical.ratings", { count: item.votesCount })}
                  </span>
                </span>
              </span>
              {showRecentVotes && item.recentVotes > 0 ? (
                <span className="discovery-rank-meta">+{item.recentVotes}</span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

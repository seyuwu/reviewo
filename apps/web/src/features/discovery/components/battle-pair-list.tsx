import Link from "next/link";

import { formatEntityDisplayName } from "../../growth/lib/format-entity-display-name";
import type { BattlePairListItem } from "../types/discovery";

interface BattlePairListProps {
  items: BattlePairListItem[];
  showVoteSplit?: boolean;
}

export function BattlePairList({ items, showVoteSplit = true }: BattlePairListProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <ul className="discovery-battle-pair-list">
      {items.map((item) => {
        const leftLabel = formatBattleLabel(item.leftLabel, item.leftSlug);
        const rightLabel = formatBattleLabel(item.rightLabel, item.rightSlug);

        return (
          <li key={item.pairSlug}>
            <Link className="discovery-battle-pair-item" href={`/compare/${item.pairSlug}`}>
              <span>
                {leftLabel} vs {rightLabel}
              </span>
              {showVoteSplit && item.totalVotes > 0 ? (
                <span className="discovery-battle-pair-meta">
                  {item.leftPercent}% / {item.rightPercent}%
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function formatBattleLabel(title: string, slug: string): string {
  return formatEntityDisplayName({
    canonicalUrl: null,
    slug,
    title
  });
}

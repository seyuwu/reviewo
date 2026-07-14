import Link from "next/link";

import { EntityAvatar } from "../../entities/components/entity-avatar";
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
        const hasVotes = item.totalVotes > 0;

        return (
          <li key={item.pairSlug}>
            <Link
              className={
                showVoteSplit && hasVotes
                  ? "discovery-battle-pair-item discovery-battle-pair-item--with-bar"
                  : "discovery-battle-pair-item"
              }
              href={`/compare/${item.pairSlug}`}
            >
              <span className="discovery-battle-pair-label">
                <span className="discovery-battle-pair-entity">
                  <EntityAvatar
                    canonicalUrl={item.leftCanonicalUrl}
                    entityId={item.leftEntityId}
                    logoUrl={item.leftLogoUrl}
                    size="sm"
                    title={leftLabel}
                  />
                  <span>{leftLabel}</span>
                </span>
                <span className="discovery-battle-pair-vs">vs</span>
                <span className="discovery-battle-pair-entity discovery-battle-pair-entity--right">
                  <span>{rightLabel}</span>
                  <EntityAvatar
                    canonicalUrl={item.rightCanonicalUrl}
                    entityId={item.rightEntityId}
                    logoUrl={item.rightLogoUrl}
                    size="sm"
                    title={rightLabel}
                  />
                </span>
              </span>
              {showVoteSplit && hasVotes ? (
                <div className="discovery-battle-pair-bar" aria-hidden="true">
                  <span
                    className="discovery-battle-pair-bar-left"
                    style={{ width: `${item.leftPercent}%` }}
                  />
                  <span
                    className="discovery-battle-pair-bar-right"
                    style={{ width: `${item.rightPercent}%` }}
                  />
                </div>
              ) : null}
              {showVoteSplit && hasVotes ? (
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

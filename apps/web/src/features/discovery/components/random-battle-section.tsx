"use client";

import Link from "next/link";

import { OpiniaIcon } from "../../../components/opinia-icon";
import { EntityAvatar } from "../../entities/components/entity-avatar";
import { formatEntityDisplayName } from "../../growth/lib/format-entity-display-name";
import type { BattlePairListItem } from "../types/discovery";
import { useTranslation } from "../../i18n/locale-provider";
import { FeedSection } from "./feed-section";

interface RandomBattleSectionProps {
  battle: BattlePairListItem | null | undefined;
}

export function RandomBattleSection({ battle }: RandomBattleSectionProps) {
  const t = useTranslation();

  if (!battle) {
    return null;
  }

  const leftLabel = formatEntityDisplayName({
    canonicalUrl: null,
    slug: battle.leftSlug,
    title: battle.leftLabel
  });
  const rightLabel = formatEntityDisplayName({
    canonicalUrl: null,
    slug: battle.rightSlug,
    title: battle.rightLabel
  });
  const leftPercent = battle.totalVotes > 0 ? battle.leftPercent : 50;
  const rightPercent = battle.totalVotes > 0 ? battle.rightPercent : 50;
  const compareHref = `/compare/${battle.pairSlug}`;

  return (
    <FeedSection heading={t("web.homeFeed.sectionRandomBattle")} headingId="home-feed-random-battle">
      <div className="discovery-random-battle discovery-random-battle--featured">
        <p className="discovery-random-battle-subtitle">{t("web.homeFeed.randomBattleSubtitle")}</p>

        <div className="discovery-random-battle-showcase">
          <div className="discovery-random-battle-entity">
            <EntityAvatar
              canonicalUrl={battle.leftCanonicalUrl}
              className="discovery-random-battle-avatar"
              entityId={battle.leftEntityId}
              logoUrl={battle.leftLogoUrl}
              size="lg"
              title={leftLabel}
            />
            <strong>{leftLabel}</strong>
            <span className="discovery-random-battle-kind">{battle.leftSlug}</span>
          </div>

          <span className="discovery-random-battle-vs-badge" aria-hidden="true">
            VS
          </span>

          <div className="discovery-random-battle-entity discovery-random-battle-entity--right">
            <EntityAvatar
              canonicalUrl={battle.rightCanonicalUrl}
              className="discovery-random-battle-avatar"
              entityId={battle.rightEntityId}
              logoUrl={battle.rightLogoUrl}
              size="lg"
              title={rightLabel}
            />
            <strong>{rightLabel}</strong>
            <span className="discovery-random-battle-kind">{battle.rightSlug}</span>
          </div>
        </div>

        <div className="discovery-random-battle-vote-bar">
          <Link
            className="discovery-random-battle-vote-side discovery-random-battle-vote-side--left"
            href={compareHref}
            style={{ flex: `${leftPercent} 1 0%` }}
            title={leftLabel}
          >
            {battle.totalVotes > 0 ? `${battle.leftPercent}%` : <OpiniaIcon className="discovery-random-battle-thumb" name="thumb" />}
          </Link>
          <span className="discovery-random-battle-vote-or" aria-hidden="true">
            OR
          </span>
          <Link
            className="discovery-random-battle-vote-side discovery-random-battle-vote-side--right"
            href={compareHref}
            style={{ flex: `${rightPercent} 1 0%` }}
            title={rightLabel}
          >
            {battle.totalVotes > 0 ? `${battle.rightPercent}%` : <OpiniaIcon className="discovery-random-battle-thumb" name="thumb" />}
          </Link>
        </div>
      </div>
    </FeedSection>
  );
}

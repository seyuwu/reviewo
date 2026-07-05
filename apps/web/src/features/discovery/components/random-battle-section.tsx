"use client";

import Link from "next/link";

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

  return (
    <FeedSection heading={t("web.homeFeed.sectionRandomBattle")} headingId="home-feed-random-battle">
      <div className="discovery-random-battle">
        <p className="discovery-random-battle-subtitle">{t("web.homeFeed.randomBattleSubtitle")}</p>

        <div className="discovery-random-battle-matchup">
          <span className="discovery-random-battle-side">{leftLabel}</span>
          <span className="discovery-random-battle-vs" aria-hidden="true">
            vs
          </span>
          <span className="discovery-random-battle-side">{rightLabel}</span>
        </div>

        {battle.totalVotes > 0 ? (
          <p className="discovery-random-battle-meta">
            {battle.leftPercent}% / {battle.rightPercent}%
          </p>
        ) : null}

        <Link className="discovery-random-battle-cta" href={`/compare/${battle.pairSlug}`}>
          {t("web.homeFeed.randomBattleVote")}
        </Link>
      </div>
    </FeedSection>
  );
}

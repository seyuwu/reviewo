"use client";

import Link from "next/link";

import { useTranslation } from "../../i18n/locale-provider";
import { BattleVotePanel } from "./battle-vote-panel";
import { formatScoreOneDecimal, formatStarRating } from "../lib/format-growth-stats";
import type { GrowthBattleResponse } from "../types/growth";

interface BattlePageViewProps {
  battle: GrowthBattleResponse;
  pairSlug: string;
}

export function BattlePageView({ battle, pairSlug }: BattlePageViewProps) {
  const t = useTranslation();

  return (
    <section className="growth-battle-layout ui-fade-in">
      <header className="entity-hero">
        <div>
          <p className="eyebrow">Opinia Battle</p>
          <h1>
            {battle.left.entity.title} vs {battle.right.entity.title}
          </h1>
          <p className="hero-copy">{t("growth.battle.title")}</p>
        </div>
      </header>

      <BattleVotePanel initialBattle={battle} pairSlug={pairSlug} />

      <div className="growth-compare-grid">
        <BattleSideSummary side={battle.left} />
        <BattleSideSummary side={battle.right} />
      </div>

      <section className="panel-card">
        <div className="growth-compare-links">
          <Link className="primary-link" href={`/compare/${pairSlug}`}>
            {t("growth.compare.title", {
              left: battle.left.entity.title,
              right: battle.right.entity.title
            })}
          </Link>
        </div>
      </section>
    </section>
  );
}

function BattleSideSummary({ side }: { side: GrowthBattleResponse["left"] }) {
  return (
    <article className="growth-compare-side panel-card">
      <h2>{side.entity.title}</h2>
      <p aria-hidden="true">{formatStarRating(side.rating.avgScore)}</p>
      <strong>{formatScoreOneDecimal(side.rating.avgScore)}/5</strong>
      <Link className="primary-link" href={`/entities/${side.entity.id}`}>
        Open page
      </Link>
    </article>
  );
}

"use client";

import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { useTranslation } from "../../i18n/locale-provider";
import { fetchGrowthBattle, submitGrowthBattleVote } from "../api/growth-api";
import { formatScoreOneDecimal, formatStarRating } from "../lib/format-growth-stats";
import { buildBattleShareUrl } from "../lib/share-urls";
import type { GrowthBattleResponse } from "../types/growth";
import { CopyLinkButton } from "./copy-link-button";
import { SocialShareButtons } from "./social-share-buttons";

interface BattleVotePanelProps {
  initialBattle: GrowthBattleResponse;
  pairSlug: string;
}

export function BattleVotePanel({ initialBattle, pairSlug }: BattleVotePanelProps) {
  const t = useTranslation();
  const [battle, setBattle] = useState(initialBattle);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const shareUrl = buildBattleShareUrl(pairSlug);

  useEffect(() => {
    void fetchGrowthBattle(pairSlug)
      .then(setBattle)
      .catch(() => {
        // Keep SSR payload when refresh fails.
      });
  }, [pairSlug]);

  const voteMutation = useMutation({
    mutationFn: (entityId: string) => submitGrowthBattleVote(pairSlug, entityId),
    onError: () => {
      setErrorMessage(t("growth.battle.error"));
    },
    onSuccess: (response) => {
      setBattle(response.battle);
      setErrorMessage(null);
    }
  });

  const votedSide =
    battle.votedEntityId === battle.left.entity.id
      ? battle.left
      : battle.votedEntityId === battle.right.entity.id
        ? battle.right
        : null;

  return (
    <section className="growth-battle-panel panel-card">
      <div className="section-heading">
        <p className="result-type">Opinia Battle</p>
        <h2>{t("growth.battle.title")}</h2>
      </div>

      {!battle.hasVoted ? (
        <div className="growth-battle-choices">
          <BattleChoiceButton
            disabled={voteMutation.isPending}
            side={battle.left}
            onVote={() => {
              voteMutation.mutate(battle.left.entity.id);
            }}
          />
          <span className="growth-battle-or">{t("growth.battle.or")}</span>
          <BattleChoiceButton
            disabled={voteMutation.isPending}
            side={battle.right}
            onVote={() => {
              voteMutation.mutate(battle.right.entity.id);
            }}
          />
        </div>
      ) : (
        <div className="growth-battle-results">
          <BattleResultBar label={battle.left.entity.title} percent={battle.left.votePercent} />
          <BattleResultBar label={battle.right.entity.title} percent={battle.right.votePercent} />
          <p className="growth-battle-status">{t("growth.battle.voteRecorded")}</p>
          <p className="muted-copy">
            {t("growth.battle.totalVotes", { count: String(battle.totalVotes) })}
          </p>
        </div>
      )}

      {errorMessage ? <p className="error-message">{errorMessage}</p> : null}

      {battle.hasVoted ? (
        <div className="growth-battle-invite">
          <h3>{t("growth.battle.inviteTitle")}</h3>
          {votedSide ? (
            <p className="muted-copy">
              {t("growth.battle.inviteBody", { choice: votedSide.entity.title })}
            </p>
          ) : null}
          <CopyLinkButton url={shareUrl} />
          <SocialShareButtons
            pageUrl={shareUrl}
            text={`${battle.left.entity.title} vs ${battle.right.entity.title}`}
          />
        </div>
      ) : null}
    </section>
  );
}

function BattleChoiceButton({
  disabled,
  onVote,
  side
}: {
  disabled: boolean;
  onVote: () => void;
  side: GrowthBattleResponse["left"];
}) {
  return (
    <button type="button" className="growth-battle-choice" disabled={disabled} onClick={onVote}>
      <strong>{side.entity.title}</strong>
      <span aria-hidden="true">{formatStarRating(side.rating.avgScore)}</span>
      <span>{formatScoreOneDecimal(side.rating.avgScore)}/5</span>
    </button>
  );
}

function BattleResultBar({ label, percent }: { label: string; percent: number }) {
  return (
    <div className="growth-battle-result-row">
      <div className="growth-battle-result-label">
        <span>{label}</span>
        <strong>{percent}%</strong>
      </div>
      <div className="growth-battle-result-track" aria-hidden="true">
        <div className="growth-battle-result-fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

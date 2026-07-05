"use client";

import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { useTranslation } from "../../i18n/locale-provider";
import { fetchGrowthBattle, submitGrowthBattleVote } from "../api/growth-api";
import { formatEntityDisplayName } from "../lib/format-entity-display-name";
import { formatScoreOneDecimal, formatStarRating, formatTrustPercent } from "../lib/format-growth-stats";
import { buildBattleShareUrl } from "../lib/share-urls";
import type { GrowthBattleResponse, GrowthCompareResponse } from "../types/growth";
import styles from "./compare-page-view.module.css";
import { CopyLinkButton } from "./copy-link-button";
import { SocialShareButtons } from "./social-share-buttons";

interface ComparePageViewProps {
  compare: GrowthCompareResponse;
  initialBattle?: GrowthBattleResponse;
}

export function ComparePageView({ compare, initialBattle }: ComparePageViewProps) {
  const t = useTranslation();
  const [battle, setBattle] = useState<GrowthBattleResponse | null>(initialBattle ?? null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const leftLabel = formatEntityDisplayName(compare.left.entity);
  const rightLabel = formatEntityDisplayName(compare.right.entity);
  const shareUrl = buildBattleShareUrl(compare.pairSlug);

  useEffect(() => {
    void fetchGrowthBattle(compare.pairSlug)
      .then(setBattle)
      .catch(() => {
        if (initialBattle) {
          setBattle(initialBattle);
        }
      });
  }, [compare.pairSlug, initialBattle]);

  const voteMutation = useMutation({
    mutationFn: (entityId: string) => submitGrowthBattleVote(compare.pairSlug, entityId),
    onError: () => {
      setErrorMessage(t("growth.battle.error"));
    },
    onSuccess: (response) => {
      setBattle(response.battle);
      setErrorMessage(null);
    }
  });

  const votedSide =
    battle?.votedEntityId === battle?.left.entity.id
      ? battle?.left ?? null
      : battle?.votedEntityId === battle?.right.entity.id
        ? battle?.right ?? null
        : null;

  const canPick = Boolean(battle && !voteMutation.isPending);
  const hasVoted = Boolean(battle?.hasVoted);

  return (
    <section className={`growth-battle-layout ui-fade-in ${styles.layout}`}>
      <header className={styles.hero}>
        <p className="eyebrow">{t("growth.panel.compareEyebrow")}</p>
        <div className={styles.matchup} aria-label={t("growth.compare.title", { left: leftLabel, right: rightLabel })}>
          <div className={styles.matchupSide}>
            <span className={styles.matchupLabel}>{t("growth.compare.sideLeft")}</span>
            <p className={styles.matchupName}>{leftLabel}</p>
          </div>
          <span className={styles.matchupVs} aria-hidden="true">
            vs
          </span>
          <div className={`${styles.matchupSide} ${styles.matchupSideRight}`}>
            <span className={styles.matchupLabel}>{t("growth.compare.sideRight")}</span>
            <p className={styles.matchupName}>{rightLabel}</p>
          </div>
        </div>
        <p className={`hero-copy ${styles.heroCopy}`}>{t("growth.battle.title")}</p>
      </header>

      <section className={`panel-card ${styles.votePanel}`}>
        {canPick ? (
          <p className={`muted-copy ${styles.voteHint}`}>
            {hasVoted ? t("growth.compare.changeHint") : t("growth.compare.pickHint")}
          </p>
        ) : null}

        <div className={styles.grid}>
          <CompareVoteCard
            compare={compare.left}
            disabled={!canPick}
            displayName={leftLabel}
            hasVoted={hasVoted}
            isVotedChoice={battle?.votedEntityId === compare.left.entity.id}
            onPick={() => {
              voteMutation.mutate(compare.left.entity.id);
            }}
          />
          <CompareVoteCard
            compare={compare.right}
            disabled={!canPick}
            displayName={rightLabel}
            hasVoted={hasVoted}
            isVotedChoice={battle?.votedEntityId === compare.right.entity.id}
            onPick={() => {
              voteMutation.mutate(compare.right.entity.id);
            }}
          />
        </div>

        {hasVoted && battle ? (
          <div className={styles.results}>
            <BattleResultBar label={leftLabel} percent={battle.left.votePercent} />
            <BattleResultBar label={rightLabel} percent={battle.right.votePercent} />
            <p className={styles.voteStatus}>{t("growth.battle.voteRecorded")}</p>
            <p className={`muted-copy ${styles.totalVotes}`}>
              {t("growth.battle.totalVotes", { count: String(battle.totalVotes) })}
            </p>
          </div>
        ) : null}

        {errorMessage ? <p className="error-message">{errorMessage}</p> : null}

        {hasVoted ? (
          <div className={styles.invite}>
            <h3>{t("growth.battle.inviteTitle")}</h3>
            {votedSide ? (
              <p className="muted-copy">
                {t("growth.battle.inviteBody", {
                  choice: formatEntityDisplayName(votedSide.entity)
                })}
              </p>
            ) : null}
            <CopyLinkButton url={shareUrl} />
            <SocialShareButtons pageUrl={shareUrl} text={`${leftLabel} vs ${rightLabel}`} />
          </div>
        ) : null}
      </section>
    </section>
  );
}

function CompareVoteCard({
  compare,
  disabled,
  displayName,
  hasVoted,
  isVotedChoice,
  onPick
}: {
  compare: GrowthCompareResponse["left"];
  disabled: boolean;
  displayName: string;
  hasVoted: boolean;
  isVotedChoice: boolean;
  onPick: () => void;
}) {
  const t = useTranslation();
  const actionLabel = isVotedChoice
    ? t("growth.compare.yourPick")
    : hasVoted
      ? t("growth.compare.changePick")
      : t("growth.compare.pickAction");

  return (
    <div className={`${styles.voteCardWrap}${isVotedChoice ? ` ${styles.voteCardVoted}` : ""}`}>
      <button type="button" className={styles.voteCard} disabled={disabled} onClick={onPick}>
        <h2 className={styles.voteCardTitle}>{displayName}</h2>
        <p aria-hidden="true">{formatStarRating(compare.rating.avgScore)}</p>
        <strong className={styles.voteCardScore}>{formatScoreOneDecimal(compare.rating.avgScore)}/5</strong>
        <div className={styles.voteCardStats}>
          <span>{formatTrustPercent(compare.trust.confidence)} trust</span>
          <span>{t("growth.compare.votes", { count: String(compare.rating.votesCount) })}</span>
          <span>{t("growth.compare.reviews", { count: String(compare.meta.reviewsCount) })}</span>
        </div>
        {!disabled ? (
          <span
            className={`${styles.voteCardAction}${isVotedChoice ? ` ${styles.voteCardActionActive}` : ""}`}
          >
            {actionLabel}
          </span>
        ) : null}
      </button>
      <Link className={styles.entityLink} href={`/entities/${compare.entity.id}`}>
        {t("growth.compare.openEntity")}
      </Link>
    </div>
  );
}

function BattleResultBar({ label, percent }: { label: string; percent: number }) {
  return (
    <div className={styles.resultRow}>
      <div className={styles.resultLabel}>
        <span>{label}</span>
        <strong>{percent}%</strong>
      </div>
      <div className={styles.resultTrack} aria-hidden="true">
        <div className={styles.resultFill} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

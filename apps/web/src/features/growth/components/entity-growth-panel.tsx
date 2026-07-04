"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { buildCompareSlug } from "@reviewo/shared";

import { useTranslation } from "../../i18n/locale-provider";
import { fetchActiveNow } from "../api/active-now";
import { CopyLinkButton } from "./copy-link-button";
import { EmbedCodeModal } from "./embed-code-modal";
import { buildEntityChatInviteUrl } from "../lib/share-urls";
import type { ActiveNowItem } from "../types/growth";
import styles from "./entity-growth-panel.module.css";

interface EntityGrowthPanelProps {
  entityId: string;
  entitySlug: string;
  entityTitle: string;
  onShareClick: () => void;
}

export function EntityGrowthPanel({
  entityId,
  entitySlug,
  entityTitle,
  onShareClick
}: EntityGrowthPanelProps) {
  const t = useTranslation();
  const [compareTargets, setCompareTargets] = useState<ActiveNowItem[]>([]);
  const [isEmbedOpen, setIsEmbedOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void fetchActiveNow(8)
      .then((response) => {
        if (cancelled) {
          return;
        }

        setCompareTargets(
          response.items.filter((item) => item.entityId !== entityId && item.entitySlug)
        );
      })
      .catch(() => {
        if (!cancelled) {
          setCompareTargets([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [entityId]);

  const examplePairSlug = buildCompareSlug(entitySlug, "telegram");

  return (
    <section className={`panel-card ${styles.panel}`} aria-labelledby="entity-growth-panel-heading">
      <div className="section-heading">
        <p className="result-type">{t("growth.panel.eyebrow")}</p>
        <h2 id="entity-growth-panel-heading">{t("growth.panel.title")}</h2>
        <p className="muted-copy">{t("growth.panel.subtitle")}</p>
      </div>

      <div className={styles.actionRow}>
        <button type="button" className={`primary-button ${styles.actionButton}`} onClick={onShareClick}>
          {t("growth.share.button")}
        </button>
        <button
          type="button"
          className={`secondary-button ${styles.actionButton}`}
          onClick={() => {
            setIsEmbedOpen(true);
          }}
        >
          {t("growth.embed.button")}
        </button>
        <CopyLinkButton
          className={`secondary-button ${styles.actionButton}`}
          label={t("growth.chat.invite")}
          url={buildEntityChatInviteUrl(entityId)}
        />
      </div>

      <div className={styles.compareSection}>
        <div className="section-heading">
          <p className="result-type">{t("growth.panel.compareEyebrow")}</p>
          <h3>{t("growth.panel.compareTitle")}</h3>
          <p className="muted-copy">{t("growth.panel.compareHint")}</p>
        </div>

        {compareTargets.length > 0 ? (
          <ul className={styles.compareList}>
            {compareTargets.slice(0, 5).map((target) => {
              const pairSlug = buildCompareSlug(entitySlug, target.entitySlug);

              return (
                <li className={styles.compareItem} key={target.entityId}>
                  <span className={styles.compareItemTitle}>
                    {entityTitle} vs {target.entityTitle}
                  </span>
                  <span className={styles.compareItemActions}>
                    <Link className={`${styles.compareLink} ${styles.compareLinkPrimary}`} href={`/compare/${pairSlug}`}>
                      {t("growth.panel.compareLink")}
                    </Link>
                    <Link className={`${styles.compareLink} ${styles.compareLinkSecondary}`} href={`/battle/${pairSlug}`}>
                      {t("growth.panel.battleLink")}
                    </Link>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}

        <p className={`muted-copy ${styles.slugHint}`}>
          {t("growth.panel.slugHint", { slug: entitySlug })}{" "}
          <code>/compare/{examplePairSlug}</code>
        </p>
      </div>

      {isEmbedOpen ? (
        <EmbedCodeModal
          entityId={entityId}
          entityTitle={entityTitle}
          onClose={() => {
            setIsEmbedOpen(false);
          }}
        />
      ) : null}
    </section>
  );
}

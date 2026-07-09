"use client";

import Link from "next/link";

import { EntityAvatar } from "../../entities/components/entity-avatar";
import { formatScoreOneDecimal } from "../../growth/lib/format-growth-stats";
import { formatEntityTypeLabel } from "../../i18n/entity-type-label";
import { useTranslation } from "../../i18n/locale-provider";
import type { EntityPageRelatedPresence } from "../types/entity-page";
import styles from "./entity-related-presences-section.module.css";

interface EntityRelatedPresencesSectionProps {
  canUnlink: boolean;
  currentEntityId: string;
  items: EntityPageRelatedPresence[];
  onUnlink?: (relatedEntityId: string) => void;
  unlinkingEntityId?: string | null;
}

export function EntityRelatedPresencesSection({
  canUnlink,
  currentEntityId,
  items,
  onUnlink,
  unlinkingEntityId = null
}: EntityRelatedPresencesSectionProps) {
  const t = useTranslation();
  const relatedItems = items.filter((item) => item.id !== currentEntityId);

  if (relatedItems.length === 0) {
    return null;
  }

  return (
    <section
      className={`panel-card ${styles.section}`}
      id="entity-related-presences"
      aria-labelledby="entity-related-presences-heading"
    >
      <h2 className={styles.heading} id="entity-related-presences-heading">
        {t("contributions.relatedPresencesTitle")}
      </h2>

      <ul className={styles.grid}>
        {relatedItems.map((item) => (
          <li key={item.id} className={styles.item}>
            <Link className={styles.card} href={`/entities/${item.id}`} title={item.title}>
              <EntityAvatar
                canonicalUrl={item.canonicalUrl}
                entityId={item.id}
                logoUrl={item.logoUrl}
                size="sm"
                title={item.title}
              />
              {item.rating ? (
                <span className={styles.score}>
                  {formatScoreOneDecimal(item.rating.avgScore)}
                  <span className={styles.scoreMuted}> · {item.rating.votesCount}</span>
                </span>
              ) : (
                <span className={styles.scoreMuted}>{t("contributions.relatedPresencesEmptyRating")}</span>
              )}
              <span className={styles.title}>{item.title}</span>
              <span className={styles.meta}>{formatCardMeta(t, item)}</span>
            </Link>
            {canUnlink && onUnlink ? (
              <button
                type="button"
                className={styles.unlinkButton}
                disabled={unlinkingEntityId === item.id}
                onClick={() => {
                  onUnlink(item.id);
                }}
              >
                {t("contributions.suggestUnlink")}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function formatCardMeta(
  t: ReturnType<typeof useTranslation>,
  item: EntityPageRelatedPresence
): string {
  const hostname = item.canonicalUrl ? formatHostname(item.canonicalUrl) : null;

  if (hostname) {
    return hostname;
  }

  return formatEntityTypeLabel(t, item.type);
}

function formatHostname(canonicalUrl: string): string {
  try {
    return new URL(canonicalUrl).hostname.replace(/^www\./, "");
  } catch {
    return canonicalUrl;
  }
}

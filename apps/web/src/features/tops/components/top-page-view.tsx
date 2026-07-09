"use client";

import { useQuery } from "@tanstack/react-query";
import type { TranslateFn } from "@reviewo/i18n";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { FormFeedback } from "../../../components/form-feedback";
import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { EntityAvatar } from "../../entities/components/entity-avatar";
import { formatEntityDisplayName } from "../../growth/lib/format-entity-display-name";
import { formatScoreOneDecimal } from "../../growth/lib/format-growth-stats";
import { formatTopCategoryLabel } from "../../i18n/top-category-label";
import { useTranslation } from "../../i18n/locale-provider";
import { fetchTopForks, forkTop, recordTopView, toggleTopLike } from "../api/tops-api";
import type { Top, TopItem } from "../types/tops";
import { TopCommentsSection } from "./top-comments-section";
import { TopsList } from "./tops-list";

interface TopPageViewProps {
  top: Top;
}

export function TopPageView({ top: initialTop }: TopPageViewProps) {
  const router = useRouter();
  const t = useTranslation();
  const { authSession } = useAuthSession();
  const viewRecordedRef = useRef(false);
  const [forkErrorMessage, setForkErrorMessage] = useState<string | null>(null);
  const [likeErrorMessage, setLikeErrorMessage] = useState<string | null>(null);
  const [isForking, setIsForking] = useState(false);
  const [isLiking, setIsLiking] = useState(false);
  const [engagement, setEngagement] = useState({
    commentsCount: initialTop.commentsCount ?? 0,
    forksCount: initialTop.forksCount ?? 0,
    likedByCurrentUser: initialTop.likedByCurrentUser ?? false,
    likesCount: initialTop.likesCount ?? 0,
    viewsCount: initialTop.viewsCount ?? 0
  });

  const forksQuery = useQuery({
    enabled: engagement.forksCount > 0,
    queryFn: () => fetchTopForks(initialTop.id),
    queryKey: ["top-forks", initialTop.id]
  });

  const canFork = Boolean(authSession?.accessToken) && !initialTop.isOwnTop;
  const canLike = Boolean(authSession?.accessToken) && !initialTop.isOwnTop;

  useEffect(() => {
    if (viewRecordedRef.current) {
      return;
    }

    viewRecordedRef.current = true;

    void recordTopView(initialTop.id, authSession?.accessToken).then((response) => {
      setEngagement((current) => ({
        ...current,
        viewsCount: response.viewsCount
      }));
    });
  }, [authSession?.accessToken, initialTop.id]);

  async function handleFork() {
    if (!authSession?.accessToken) {
      return;
    }

    setForkErrorMessage(null);
    setIsForking(true);

    try {
      const forked = await forkTop(initialTop.id, authSession.accessToken);
      router.push(`/tops/${forked.slug}/edit`);
    } catch {
      setForkErrorMessage(t("web.userTops.forkFailed"));
    } finally {
      setIsForking(false);
    }
  }

  async function handleToggleLike() {
    if (!authSession?.accessToken) {
      return;
    }

    setLikeErrorMessage(null);
    setIsLiking(true);

    try {
      const response = await toggleTopLike(initialTop.id, authSession.accessToken);
      setEngagement((current) => ({
        ...current,
        likedByCurrentUser: response.likedByCurrentUser,
        likesCount: response.likesCount
      }));
    } catch {
      setLikeErrorMessage(t("web.userTops.likeFailed"));
    } finally {
      setIsLiking(false);
    }
  }

  return (
    <div className="home-hub">
      <section className="home-hub-card" aria-labelledby="user-top-page-heading">
        <header className="home-hub-header">
          <p className="eyebrow">{t("web.userTops.pageEyebrow")}</p>
          {initialTop.category ? (
            <p className="top-page-category">
              <Link className="top-category-chip" href={`/tops/category/${initialTop.category.slug}`}>
                {formatTopCategoryLabel(t, initialTop.category.slug, initialTop.category.title)}
              </Link>
            </p>
          ) : null}
          <h1 id="user-top-page-heading">{initialTop.title}</h1>
          {initialTop.description ? <p className="home-hub-subtitle">{initialTop.description}</p> : null}
          <p className="muted-copy">
            {t("web.userTops.authorMeta", {
              author: initialTop.author.displayName,
              count: String(initialTop.itemCount)
            })}
          </p>
          {initialTop.forkedFrom ? (
            <p className="muted-copy">
              {t("web.userTops.forkedFromPrefix")}{" "}
              <Link href={`/tops/${initialTop.forkedFrom.slug}`}>{initialTop.forkedFrom.title}</Link>
              {" — "}
              {initialTop.forkedFrom.author.displayName}
            </p>
          ) : null}
          {initialTop.rankMode === "HYBRID" ? (
            <p className="muted-copy">
              {t("web.userTops.rankModeHybridBadge")}
              {initialTop.systemSortKey
                ? ` · ${formatSystemSortKeyLabel(initialTop.systemSortKey, t)}`
                : null}
            </p>
          ) : null}
          {initialTop.rankMode === "SYSTEM" ? (
            <p className="muted-copy">
              {t("web.userTops.rankModeSystemBadge")}
              {initialTop.systemSortKey
                ? ` · ${formatSystemSortKeyLabel(initialTop.systemSortKey, t)}`
                : null}
            </p>
          ) : null}

          <div className="review-vote-controls" role="group" aria-label={t("web.userTops.engagementGroupAria")}>
            {canLike ? (
              <button
                type="button"
                className={
                  engagement.likedByCurrentUser
                    ? "review-vote-button review-like-button is-active"
                    : "review-vote-button review-like-button"
                }
                aria-pressed={engagement.likedByCurrentUser}
                disabled={isLiking}
                onClick={() => {
                  void handleToggleLike();
                }}
              >
                {t("web.userTops.engagementLikes", { count: String(engagement.likesCount) })}
              </button>
            ) : (
              <span className="muted-copy">
                {t("web.userTops.engagementLikes", { count: String(engagement.likesCount) })}
              </span>
            )}
            <span className="muted-copy">
              {t("web.userTops.engagementViews", { count: String(engagement.viewsCount) })}
            </span>
            <a className="muted-copy" href="#top-comments">
              {t("web.userTops.engagementComments", { count: String(engagement.commentsCount) })}
            </a>
            {engagement.forksCount > 0 ? (
              <a className="muted-copy" href="#top-forks">
                {t("web.userTops.engagementForks", { count: String(engagement.forksCount) })}
              </a>
            ) : (
              <span className="muted-copy">
                {t("web.userTops.engagementForks", { count: String(engagement.forksCount) })}
              </span>
            )}
          </div>
        </header>

        <div className="home-hub-actions">
          {initialTop.isOwnTop ? (
            <Link className="button-secondary" href={`/tops/${initialTop.slug}/edit`}>
              {t("web.userTops.editCta")}
            </Link>
          ) : null}
          {canFork ? (
            <button
              type="button"
              className="button-secondary"
              disabled={isForking}
              onClick={() => {
                void handleFork();
              }}
            >
              {isForking ? t("web.userTops.forking") : t("web.userTops.forkCta")}
            </button>
          ) : null}
        </div>

        <FormFeedback errorMessage={forkErrorMessage ?? likeErrorMessage} />

        <div className="panel-card">
          {initialTop.items.length > 0 ? (
            <ol className="discovery-rank-list">
              {initialTop.items.map((item) => {
                const label = formatEntityDisplayName(item.entity);

                return (
                  <li key={item.entity.id}>
                    <div className="discovery-rank-item">
                      <span className="discovery-rank-item-main">
                        <span className="discovery-rank-position">{item.position}</span>
                        <EntityAvatar
                          canonicalUrl={item.entity.canonicalUrl}
                          entityId={item.entity.id}
                          logoUrl={item.entity.logoUrl}
                          size="sm"
                          title={label}
                        />
                        <span>
                          <Link href={`/entities/${item.entity.id}`}>
                            <strong>{label}</strong>
                          </Link>
                          {item.rating ? (
                            <span className="muted-copy discovery-rank-score">
                              {formatScoreOneDecimal(item.rating.avgScore)} ·{" "}
                              {t("search.canonical.ratings", { count: item.rating.votesCount })}
                            </span>
                          ) : null}
                          {item.note ? <p className="muted-copy">{item.note}</p> : null}
                          {initialTop.rankMode === "HYBRID" ? (
                            <p className="muted-copy discovery-rank-score">
                              {formatHybridRankMeta(item, t)}
                            </p>
                          ) : null}
                          {initialTop.rankMode === "SYSTEM" &&
                          item.systemPositionStatus === "insufficient_data" ? (
                            <p className="muted-copy discovery-rank-score">
                              {t("web.userTops.hybridInsufficientData")}
                            </p>
                          ) : null}
                        </span>
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="muted-copy">{t("web.userTops.emptyItems")}</p>
          )}
        </div>

        <TopCommentsSection
          topId={initialTop.id}
          onCommentCreated={() => {
            setEngagement((current) => ({
              ...current,
              commentsCount: current.commentsCount + 1
            }));
          }}
        />

        {engagement.forksCount > 0 ? (
          <div className="panel-card" id="top-forks">
            <header className="panel-header">
              <h2>{t("web.userTops.forksTitle", { count: String(engagement.forksCount) })}</h2>
            </header>
            {forksQuery.isLoading ? (
              <p className="muted-copy">{t("web.userTops.forksLoading")}</p>
            ) : (
              <TopsList
                emptyMessage={t("web.userTops.forksEmpty")}
                items={forksQuery.data?.items ?? []}
              />
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function formatSystemSortKeyLabel(
  sortKey: NonNullable<Top["systemSortKey"]>,
  t: TranslateFn
): string {
  if (sortKey === "POPULARITY") {
    return t("web.userTops.systemSortKeyPOPULARITY");
  }

  if (sortKey === "RATING") {
    return t("web.userTops.systemSortKeyRATING");
  }

  if (sortKey === "RELIABILITY") {
    return t("web.userTops.systemSortKeyRELIABILITY");
  }

  return t("web.userTops.systemSortKeyPOPULARITY");
}

function formatHybridRankMeta(item: TopItem, t: TranslateFn): string {
  const authorPart = t("web.userTops.hybridAuthorPosition", {
    position: String(item.position)
  });

  if (item.systemPositionStatus === "insufficient_data") {
    return `${authorPart} · ${t("web.userTops.hybridInsufficientData")}`;
  }

  if (item.systemPosition === undefined) {
    return authorPart;
  }

  const opiniaPart = t("web.userTops.hybridSystemPosition", {
    position: String(item.systemPosition)
  });

  if (item.positionDelta === undefined || item.positionDelta === 0) {
    return `${authorPart} · ${opiniaPart} · ${t("web.userTops.hybridDeltaSame")}`;
  }

  if (item.positionDelta < 0) {
    return `${authorPart} · ${opiniaPart} · ${t("web.userTops.hybridDeltaUp", {
      delta: String(Math.abs(item.positionDelta))
    })}`;
  }

  return `${authorPart} · ${opiniaPart} · ${t("web.userTops.hybridDeltaDown", {
    delta: String(item.positionDelta)
  })}`;
}

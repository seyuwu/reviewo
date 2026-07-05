"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { BackToSearchLink } from "../../../components/back-to-search-link";
import { FormFeedback } from "../../../components/form-feedback";
import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { EntityChatPanel } from "../../entity-chat/components/entity-chat-panel";
import { EntityCompareChips } from "../../growth/components/entity-compare-chips";
import { EmbedCodeModalTrigger } from "../../growth/components/embed-code-modal";
import { ShareSheet } from "../../growth/components/share-sheet";
import {
  capturePopoverAnchor,
  serializePopoverAnchor,
  type PopoverAnchor
} from "../../growth/lib/anchored-popover-style";
import { EntityHeroBar } from "./entity-hero-bar";
import { useLocale, useTranslation } from "../../i18n/locale-provider";
import { ApiError } from "../../../lib/api/api-error";
import { publicEnv } from "../../../lib/config/public-env";
import {
  getEntityPage,
  getMyRating,
  getMyReview,
  likeReview,
  rateEntity,
  unlikeReview,
  upsertMyReview
} from "../api/entity-page";
import type { EntityPageResponse, RatingAggregate, Review, TrustConfidence } from "../types/entity-page";
import { sortEntityReviews, type EntityReviewSort } from "../lib/sort-entity-reviews";
import styles from "./entity-page.module.css";
import { ReviewTextContent } from "./review-text-content";

const RATING_SCORES = [1, 2, 3, 4, 5] as const;
const MAX_REVIEW_TEXT_LENGTH = 5000;

interface EntityPageViewProps {
  entityId: string;
}

export function EntityPageView({ entityId }: EntityPageViewProps) {
  const searchParams = useSearchParams();
  const returnQuery = searchParams.get("q")?.trim() ?? "";
  const shouldOpenChat = searchParams.get("chat") === "open";
  const queryClient = useQueryClient();
  const t = useTranslation();
  const { resolvedLocale: locale } = useLocale();
  const { authSession, isAuthSessionLoaded, signOut } = useAuthSession();
  const accessToken = authSession?.accessToken;
  const [selectedScore, setSelectedScore] = useState<number | null>(null);
  const [reviewText, setReviewText] = useState("");
  const [ratingStatusMessage, setRatingStatusMessage] = useState<string | null>(null);
  const [ratingErrorMessage, setRatingErrorMessage] = useState<string | null>(null);
  const [reviewStatusMessage, setReviewStatusMessage] = useState<string | null>(null);
  const [reviewErrorMessage, setReviewErrorMessage] = useState<string | null>(null);
  const [shareAnchor, setShareAnchor] = useState<PopoverAnchor | null>(null);
  const [syncedChatHeight, setSyncedChatHeight] = useState<number | undefined>(undefined);
  const [syncedReviewsPanelHeight, setSyncedReviewsPanelHeight] = useState<number | undefined>(undefined);
  const leftTopStackRef = useRef<HTMLDivElement>(null);
  const asideFormsRef = useRef<HTMLDivElement>(null);
  const hasHydratedReviewRef = useRef(false);

  const entityPageQuery = useQuery({
    queryFn: () => getEntityPage(entityId, accessToken),
    queryKey: ["entity-page", entityId, accessToken ?? null],
    placeholderData: keepPreviousData
  });

  const myRatingQuery = useQuery({
    enabled: Boolean(accessToken),
    queryFn: () => getMyRating(entityId, accessToken ?? ""),
    queryKey: ["entity-page", "my-rating", entityId, accessToken]
  });

  const myReviewQuery = useQuery({
    enabled: Boolean(accessToken),
    queryFn: () => getMyReview(entityId, accessToken ?? ""),
    queryKey: ["entity-page", "my-review", entityId, accessToken]
  });

  const rateMutation = useMutation({
    mutationFn: (score: number) => {
      if (!accessToken) {
        throw new Error("Missing auth token");
      }

      return rateEntity(entityId, score, accessToken);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) {
        signOut();
        setRatingErrorMessage(t("rating.sessionExpired"));
        return;
      }

      setRatingErrorMessage(readApiErrorMessage(error) ?? t("rating.updateFailed"));
    },
    onSuccess: () => {
      setRatingStatusMessage(t("rating.saved"));
      setRatingErrorMessage(null);
      void invalidateEntityPageData(queryClient, entityId);
    }
  });

  const reviewMutation = useMutation({
    mutationFn: (text: string) => {
      if (!accessToken) {
        throw new Error("Missing auth token");
      }

      return upsertMyReview(entityId, text, accessToken);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) {
        signOut();
        setReviewErrorMessage(t("reviews.sessionExpired"));
        return;
      }

      setReviewErrorMessage(readApiErrorMessage(error) ?? t("reviews.updateFailed"));
    },
    onSuccess: (savedReview) => {
      setReviewStatusMessage(t("reviews.save.success"));
      setReviewErrorMessage(null);

      if (accessToken) {
        queryClient.setQueryData(["entity-page", "my-review", entityId, accessToken], savedReview);
      }

      void queryClient.invalidateQueries({ queryKey: ["entity-page", entityId] });
    }
  });

  useEffect(() => {
    setSelectedScore(myRatingQuery.data?.score ?? null);
  }, [myRatingQuery.data?.score]);

  useEffect(() => {
    hasHydratedReviewRef.current = false;
    setReviewText("");
  }, [entityId, accessToken]);

  useEffect(() => {
    if (!myReviewQuery.isSuccess || hasHydratedReviewRef.current) {
      return;
    }

    setReviewText(myReviewQuery.data?.text ?? "");
    hasHydratedReviewRef.current = true;
  }, [myReviewQuery.isSuccess, myReviewQuery.data?.text]);

  useEffect(() => {
    const node = leftTopStackRef.current;

    if (!node) {
      return;
    }

    const syncChatHeight = (): void => {
      setSyncedChatHeight(Math.round(node.getBoundingClientRect().height));
    };

    syncChatHeight();

    const observer = new ResizeObserver(syncChatHeight);
    observer.observe(node);
    window.addEventListener("resize", syncChatHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncChatHeight);
    };
  }, [entityId, entityPageQuery.data, entityPageQuery.isSuccess]);

  useEffect(() => {
    const node = asideFormsRef.current;

    if (!node) {
      return;
    }

    const syncReviewsPanelHeight = (): void => {
      setSyncedReviewsPanelHeight(Math.round(node.getBoundingClientRect().height));
    };

    syncReviewsPanelHeight();

    const observer = new ResizeObserver(syncReviewsPanelHeight);
    observer.observe(node);
    window.addEventListener("resize", syncReviewsPanelHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncReviewsPanelHeight);
    };
  }, [
    entityId,
    entityPageQuery.data,
    entityPageQuery.isSuccess,
    myReviewQuery.data?.text,
    reviewText
  ]);

  const pageData = entityPageQuery.data;
  const canInteract = Boolean(accessToken);
  const trimmedReviewText = reviewText.trim();
  const savedReview = myReviewQuery.data;
  const hasSavedReview = Boolean(savedReview?.text?.trim());
  const reviewSaveLabel = hasSavedReview
    ? t("web.entity.reviewUpdate")
    : t("web.entity.reviewSubmit");

  function handleRatingSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRatingStatusMessage(null);
    setRatingErrorMessage(null);

    if (!canInteract) {
      setRatingErrorMessage(t("web.entity.signInBeforeRating"));
      return;
    }

    if (!selectedScore) {
      setRatingErrorMessage(t("web.entity.chooseScore"));
      return;
    }

    rateMutation.mutate(selectedScore);
  }

  function handleReviewSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReviewStatusMessage(null);
    setReviewErrorMessage(null);

    if (!canInteract) {
      setReviewErrorMessage(t("web.entity.signInBeforeReview"));
      return;
    }

    if (!trimmedReviewText) {
      setReviewErrorMessage(t("web.entity.writeBeforeSubmit"));
      return;
    }

    reviewMutation.mutate(trimmedReviewText);
  }

  if (entityPageQuery.isLoading) {
    return <EntityPageSkeleton />;
  }

  if (entityPageQuery.isError || !pageData) {
    return <EntityPageErrorState returnQuery={returnQuery} />;
  }

  return (
    <section className={`entity-page ui-fade-in ${styles.entityPageShell}`} aria-labelledby="entity-page-heading">
      <BackToSearchLink query={returnQuery} />

      {shareAnchor ? (
        <ShareSheet
          anchor={shareAnchor}
          avgScore={pageData.rating.avgScore}
          entityId={entityId}
          entityTitle={pageData.entity.title}
          reviewsCount={pageData.meta.reviewsCount}
          trustConfidence={pageData.trust.confidence}
          onClose={() => {
            setShareAnchor(null);
          }}
        />
      ) : null}

      <div className={styles.pageGrid}>
        <div className={styles.pageGridHero}>
          <EntityHeroBar pageData={pageData} returnQuery={returnQuery} />
        </div>

        <div className={styles.mainColumn} ref={leftTopStackRef}>
          <RatingSummary rating={pageData.rating} />
          <TrustSummary compact trust={pageData.trust} />
        </div>

        <div
          className={`${styles.asideColumn} ${styles.asideChat}`}
          id="entity-live-chat"
          style={
            syncedChatHeight
              ? { height: syncedChatHeight, maxHeight: syncedChatHeight }
              : undefined
          }
        >
          <EntityChatPanel
            accessToken={accessToken ?? null}
            entityId={entityId}
            entityTitle={pageData.entity.title}
            initialExpanded
            isAuthenticated={canInteract}
            placement="sidebar"
            scrollIntoViewOnMount={shouldOpenChat}
            onRequestSignIn={() => {
              window.location.assign("/profile");
            }}
          />
        </div>

        <div className={styles.mainColumn}>
          <ReviewsList
            accessToken={accessToken}
            canInteract={canInteract}
            entityId={entityId}
            panelHeight={syncedReviewsPanelHeight}
            reviews={pageData.reviews}
            reviewsCount={pageData.meta.reviewsCount}
          />
        </div>

        <div
          ref={asideFormsRef}
          className={`${styles.asideColumn} ${styles.asideForms}`}
          aria-label={t("web.entity.asideAriaLabel")}
        >
          <form
            id="entity-rate-form"
            className={`panel-card form-stack ${styles.constrainedPanel}`}
            onSubmit={handleRatingSubmit}
          >
            <div className="section-heading">
              <p className="result-type">{t("web.entity.rateTitle")}</p>
              <h2>{t("web.entity.rateThisEntity")}</h2>
            </div>

            <div className="rating-choice-list" aria-label={t("web.entity.chooseRatingAria")}>
              {RATING_SCORES.map((score) => (
                <button
                  key={score}
                  type="button"
                  className={
                    selectedScore === score ? "rating-choice rating-choice-active" : "rating-choice"
                  }
                  disabled={!canInteract || !isAuthSessionLoaded || rateMutation.isPending}
                  aria-pressed={selectedScore === score}
                  onClick={() => {
                    setSelectedScore(score);
                  }}
                >
                  {score}
                </button>
              ))}
            </div>

            <button
              type="submit"
              className="primary-button primary-button-stable-label"
              disabled={!canInteract || !selectedScore || rateMutation.isPending}
              aria-busy={rateMutation.isPending}
            >
              {rateMutation.isPending ? t("web.entity.savingRating") : t("web.entity.rateSubmit")}
            </button>

            <FormFeedback errorMessage={ratingErrorMessage} statusMessage={ratingStatusMessage} />
          </form>

          <form
            id="entity-my-review"
            className={`panel-card form-stack ${styles.constrainedPanel}`}
            onSubmit={handleReviewSubmit}
          >
            <div className="section-heading">
              <p className="result-type">{t("web.entity.myReviewTitle")}</p>
              <h2>{t("web.entity.shareContext")}</h2>
            </div>

            {hasSavedReview && savedReview ? (
              <div className={styles.savedReviewPreview} aria-label={t("web.entity.myReviewTitle")}>
                <p className="result-type">{t("web.entity.publishedOn")}</p>
                <div className={styles.reviewTextWrap}>
                  <ReviewTextContent text={savedReview.text} />
                </div>
                <p className="muted-copy">
                  {t("web.entity.lastUpdated", {
                    date: formatDate(savedReview.updatedAt, locale)
                  })}
                </p>
              </div>
            ) : null}

            <label className="field-label">
              {t("web.entity.reviewTextLabel")}
              <textarea
                maxLength={MAX_REVIEW_TEXT_LENGTH}
                minLength={1}
                placeholder={t("web.entity.reviewPlaceholder")}
                rows={7}
                value={reviewText}
                disabled={!canInteract || reviewMutation.isPending}
                onChange={(event) => {
                  setReviewText(event.target.value);
                }}
              />
            </label>

            <p className={`muted-copy ${styles.reviewLengthCounter}`} aria-live="polite">
              {t("reviews.myReview.charCounter", {
                length: reviewText.length,
                max: MAX_REVIEW_TEXT_LENGTH
              })}
            </p>

            <button
              type="submit"
              className="primary-button primary-button-stable-label"
              disabled={!canInteract || !trimmedReviewText || reviewMutation.isPending}
              aria-busy={reviewMutation.isPending}
            >
              {reviewMutation.isPending ? t("reviews.save.saving") : reviewSaveLabel}
            </button>

            <FormFeedback errorMessage={reviewErrorMessage} statusMessage={reviewStatusMessage} />
          </form>
        </div>

        <section className={`panel-card ${styles.pageGridFull}`} id="entity-compare">
          <EntityCompareChips entityId={entityId} entitySlug={pageData.entity.slug} />
        </section>

        <section
          className={`panel-card ${styles.pageGridFull} ${styles.mainFooter}`}
          id="entity-page-footer"
          aria-labelledby="entity-page-footer-heading"
        >
          <div className="section-heading">
            <p className="result-type">{t("web.entity.footerEyebrow")}</p>
            <h2 id="entity-page-footer-heading">{t("web.entity.footerTitle")}</h2>
          </div>
          <div className={styles.footerActions}>
            <button
              type="button"
              className="primary-button"
              onClick={(event) => {
                setShareAnchor(serializePopoverAnchor(capturePopoverAnchor(event.nativeEvent)));
              }}
            >
              {t("growth.share.button")}
            </button>
            <EmbedCodeModalTrigger
              className="secondary-button"
              entityId={entityId}
              entityTitle={pageData.entity.title}
            />
          </div>
        </section>

        <div className={styles.pageGridFull}>
          <ExtensionInstallCta />
        </div>
      </div>
    </section>
  );
}

function RatingSummary({ rating }: { rating: RatingAggregate }) {
  const t = useTranslation();
  const maxVotes = useMemo(
    () => Math.max(...RATING_SCORES.map((score) => getDistributionCount(rating, score)), 1),
    [rating.distribution]
  );

  return (
    <section className={`panel-card entity-section ${styles.constrainedPanel}`} aria-labelledby="rating-summary-heading">
      <div className="section-heading">
        <p className="result-type">{t("web.entity.ratingEyebrow")}</p>
        <h2 id="rating-summary-heading">
          {t("web.entity.averageScore", { score: formatScore(rating.avgScore) })}
        </h2>
      </div>
      <p className="muted-copy">
        {t("web.entity.basedOnRatings", { count: rating.votesCount })}
      </p>

      <div className={`rating-breakdown ${styles.ratingBreakdown}`}>
        {[...RATING_SCORES].reverse().map((score) => {
          const count = getDistributionCount(rating, score);
          const widthPercent = Math.round((count / maxVotes) * 100);

          return (
            <div className={`rating-breakdown-row ${styles.ratingBreakdownRow}`} key={score}>
              <span>{score}</span>
              <div className={`rating-bar ${styles.ratingBar}`} aria-hidden="true">
                <span style={{ width: `${widthPercent}%` }} />
              </div>
              <strong>{count}</strong>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function TrustSummary({ compact = false, trust }: { compact?: boolean; trust: TrustConfidence }) {
  const t = useTranslation();
  const reliabilityLabel = formatRatingReliability(t, trust);
  const manipulationRiskLabel = formatManipulationRiskLabel(t, trust.manipulationRisk);

  if (compact) {
    return (
      <section
        className={`panel-card entity-section entity-trust-compact ${styles.constrainedPanel}`}
        aria-labelledby="trust-summary-heading"
      >
        <div className="section-heading section-heading-row">
          <h2 id="trust-summary-heading">{reliabilityLabel}</h2>
          {manipulationRiskLabel ? <span className="muted-copy">{manipulationRiskLabel}</span> : null}
        </div>
        <div className="trust-meter trust-meter-compact" aria-hidden="true">
          <span style={{ width: `${Math.round(trust.confidence * 100)}%` }} />
        </div>
      </section>
    );
  }

  return (
    <section className={`panel-card entity-section ${styles.constrainedPanel}`} aria-labelledby="trust-summary-heading">
      <div className="section-heading">
        <p className="result-type">{t("web.entity.confidenceEyebrow")}</p>
        <h2 id="trust-summary-heading">{reliabilityLabel}</h2>
      </div>
      <p className="muted-copy">
        {t("rating.dataReliability.label")}: {formatReliabilityPercent(trust.dataReliability ?? trust.confidence)}
        {manipulationRiskLabel ? ` · ${manipulationRiskLabel}` : ""}
      </p>
      <p className="muted-copy">{t("web.entity.confidenceHint")}</p>
      <div className="trust-meter" aria-hidden="true">
        <span style={{ width: `${Math.round(trust.confidence * 100)}%` }} />
      </div>
    </section>
  );
}

function ExtensionInstallCta() {
  const t = useTranslation();
  const isExtensionInstalled = useReviewoExtensionPresence();

  if (isExtensionInstalled) {
    return null;
  }

  return (
    <aside className={`panel-card extension-cta ${styles.constrainedPanel}`} aria-label={t("web.extensionCta.ariaLabel")}>
      <div className="section-heading">
        <p className="result-type">{t("web.extensionCta.eyebrow")}</p>
        <h2>{t("web.extensionCta.title")}</h2>
      </div>
      <p className="muted-copy">{t("web.extensionCta.body")}</p>
      {publicEnv.extensionInstallUrl ? (
        <a
          className="primary-link"
          href={publicEnv.extensionInstallUrl}
          rel="noopener noreferrer"
          target="_blank"
        >
          {t("web.extensionCta.action")}
        </a>
      ) : (
        <p className="muted-copy extension-cta-note">{t("web.extensionCta.noInstallUrl")}</p>
      )}
    </aside>
  );
}

function useReviewoExtensionPresence(): boolean {
  const [isPresent, setIsPresent] = useState(false);

  useEffect(() => {
    const handleMessage = (event: MessageEvent): void => {
      if (event.source !== window || event.origin !== window.location.origin) {
        return;
      }

      if (
        event.data?.source === "reviewo-extension" &&
        event.data?.type === "reviewo:extension-present"
      ) {
        setIsPresent(true);
      }
    };

    window.addEventListener("message", handleMessage);
    window.postMessage({ source: "reviewo-web", type: "reviewo:extension-ping" }, window.location.origin);

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  return isPresent;
}

function ReviewsList({
  accessToken,
  canInteract,
  entityId,
  panelHeight,
  reviews: initialReviews,
  reviewsCount
}: {
  accessToken: string | undefined;
  canInteract: boolean;
  entityId: string;
  panelHeight: number | undefined;
  reviews: Review[];
  reviewsCount: number;
}) {
  const t = useTranslation();
  const { resolvedLocale: locale } = useLocale();
  const queryClient = useQueryClient();
  const previousEntityIdRef = useRef(entityId);
  const [reviews, setReviews] = useState(initialReviews);
  const [reviewSort, setReviewSort] = useState<EntityReviewSort>("likes");
  const [voteErrorMessage, setVoteErrorMessage] = useState<string | null>(null);
  const [pendingReviewId, setPendingReviewId] = useState<string | null>(null);
  const displayedReviews = useMemo(
    () => sortEntityReviews(reviews, reviewSort),
    [reviewSort, reviews]
  );

  useEffect(() => {
    if (previousEntityIdRef.current !== entityId) {
      previousEntityIdRef.current = entityId;
      setReviews(initialReviews);
      setReviewSort("likes");
      return;
    }

    setReviews((current) => mergeReviewListsPreservingOrder(current, initialReviews));
  }, [initialReviews, entityId]);

  const voteMutation = useMutation({
    mutationFn: ({
      reviewId,
      willLike
    }: {
      reviewId: string;
      willLike: boolean;
    }) => {
      if (!accessToken) {
        throw new Error("Missing auth token");
      }

      return willLike ? likeReview(reviewId, accessToken) : unlikeReview(reviewId, accessToken);
    },
    onError: (error, variables) => {
      setPendingReviewId(null);
      setReviews((current) =>
        current.map((item) =>
          item.id === variables.reviewId
            ? applyOptimisticReviewVote(item, !variables.willLike)
            : item
        )
      );
      setVoteErrorMessage(readApiErrorMessage(error) ?? t("reviews.vote.likeError"));
    },
    onSuccess: (updatedReview) => {
      setPendingReviewId(null);
      setVoteErrorMessage(null);
      setReviews((current) =>
        current.map((item) => (item.id === updatedReview.id ? updatedReview : item))
      );

      queryClient.setQueryData<EntityPageResponse>(
        ["entity-page", entityId, accessToken ?? null],
        (current) => {
          if (!current) {
            return current;
          }

          return {
            ...current,
            reviews: current.reviews.map((item) =>
              item.id === updatedReview.id ? updatedReview : item
            )
          };
        }
      );
    }
  });

  function handleToggleLike(review: Review): void {
    if (!canInteract || !accessToken || pendingReviewId === review.id) {
      return;
    }

    if (review.isOwnReview) {
      return;
    }

    const willLike = !review.likedByCurrentUser;

    setVoteErrorMessage(null);
    setPendingReviewId(review.id);
    setReviews((current) =>
      current.map((item) =>
        item.id === review.id ? applyOptimisticReviewVote(item, willLike) : item
      )
    );
    voteMutation.mutate({ reviewId: review.id, willLike });
  }

  return (
    <section
      className={`panel-card entity-section ${styles.constrainedPanel} ${styles.reviewsPanel}`}
      aria-labelledby="reviews-heading"
      style={panelHeight ? { height: panelHeight, maxHeight: panelHeight } : undefined}
    >
      <div className={`section-heading section-heading-row ${styles.reviewsPanelHeader}`}>
        <p className="result-type" id="reviews-heading">
          {t("web.entity.reviewsEyebrow")}
        </p>
        <div className={styles.reviewsPanelMeta}>
          <label className={styles.reviewSortLabel}>
            {t("reviews.sort.label")}
            <select
              aria-label={t("reviews.sort.label")}
              className={styles.reviewSortSelect}
              value={reviewSort}
              onChange={(event) => {
                setReviewSort(event.target.value as EntityReviewSort);
              }}
            >
              <option value="likes">{t("reviews.sort.mostHelpful")}</option>
              <option value="newest">{t("reviews.sort.newest")}</option>
            </select>
          </label>
          <span className="result-action">
            {t("web.entity.totalReviews", { count: reviewsCount })}
          </span>
        </div>
      </div>

      <div className={styles.reviewsPanelBody}>
        {displayedReviews.length > 0 ? (
          <div className={`review-list ${styles.reviewList}`}>
            {displayedReviews.map((review) => {
              const isOwnReview = review.isOwnReview;
              const canVote = canInteract && !isOwnReview;

              return (
                <article
                  className={`review-card ${styles.reviewCard}${isOwnReview ? " is-own-review" : ""}`}
                  key={review.id}
                >
                  <ReviewTextContent text={review.text} />
                  <div className="review-card-footer">
                    <div
                      className="review-vote-controls"
                      role="group"
                      aria-label={t("reviews.vote.groupAriaLabel")}
                    >
                      <button
                        type="button"
                        className={
                          review.likedByCurrentUser
                            ? "review-vote-button review-like-button is-active"
                            : "review-vote-button review-like-button"
                        }
                        aria-pressed={review.likedByCurrentUser}
                        disabled={!canVote}
                        title={
                          isOwnReview
                            ? t("reviews.vote.ownReviewTooltip")
                            : review.likedByCurrentUser
                              ? t("reviews.vote.unlikeTooltip")
                              : t("reviews.vote.likeTooltip")
                        }
                        onClick={() => {
                          handleToggleLike(review);
                        }}
                      >
                        👍 {review.likesCount}
                      </button>
                      <button
                        type="button"
                        className="review-vote-button review-unlike-button"
                        disabled={!canVote || !review.likedByCurrentUser}
                        title={
                          isOwnReview
                            ? t("reviews.vote.ownReviewTooltip")
                            : t("reviews.vote.unlikeTooltip")
                        }
                        onClick={() => {
                          handleToggleLike(review);
                        }}
                      >
                        👎
                      </button>
                    </div>
                    <div className="review-meta">
                      {isOwnReview ? (
                        <span className="review-you-label">{t("reviews.author.you")}</span>
                      ) : null}
                      <span>
                        {t("web.entity.updated", { date: formatDate(review.updatedAt, locale) })}
                      </span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className={`muted-copy ${styles.reviewsEmptyHint}`}>{t("web.entity.firstReviewHint")}</p>
        )}
      </div>

      <FormFeedback errorMessage={voteErrorMessage} />
    </section>
  );
}

function applyOptimisticReviewVote(review: Review, willLike: boolean): Review {
  return {
    ...review,
    likedByCurrentUser: willLike,
    likesCount: Math.max(0, review.likesCount + (willLike ? 1 : -1))
  };
}

function mergeReviewListsPreservingOrder(current: Review[], incoming: Review[]): Review[] {
  if (current.length === 0) {
    return incoming;
  }

  const incomingById = new Map(incoming.map((review) => [review.id, review]));
  const currentIds = new Set(current.map((review) => review.id));
  const merged = current
    .map((review) => incomingById.get(review.id))
    .filter((review): review is Review => review !== undefined);

  for (const review of incoming) {
    if (!currentIds.has(review.id)) {
      merged.push(review);
    }
  }

  return merged;
}

function EntityPageSkeleton() {
  return (
    <section className="entity-page entity-page-skeleton" aria-hidden="true">
      <div className="entity-hero">
        <div className="ui-skeleton ui-skeleton-line ui-skeleton-line-short" />
        <div className="ui-skeleton ui-skeleton-heading" />
        <div className="ui-skeleton ui-skeleton-copy" />
      </div>
      <div className="entity-page-grid entity-page-skeleton-grid">
        <div className="entity-page-main">
          <div className="panel-card">
            <div className="ui-skeleton ui-skeleton-line" />
            <div className="ui-skeleton ui-skeleton-field-row" />
            <div className="ui-skeleton ui-skeleton-field-row" />
            <div className="ui-skeleton ui-skeleton-field-row" />
          </div>
        </div>
        <aside className="entity-page-aside">
          <div className="panel-card">
            <div className="ui-skeleton ui-skeleton-line" />
            <div className="ui-skeleton ui-skeleton-field-row" />
            <div className="ui-skeleton ui-skeleton-field-row" />
          </div>
        </aside>
      </div>
    </section>
  );
}

function EntityPageErrorState({ returnQuery }: { returnQuery: string }) {
  const t = useTranslation();
  const searchHref = returnQuery ? `/?q=${encodeURIComponent(returnQuery)}` : "/";

  return (
    <section className="creation-card entity-placeholder-card ui-fade-in">
      <p className="eyebrow">{t("web.entity.pageEyebrow")}</p>
      <h1>{t("web.entity.unavailable")}</h1>
      <p className="hero-copy">{t("web.entity.unavailableHint")}</p>
      <Link className="entity-back-button" href={searchHref}>
        ← {t("web.entity.backToSearch")}
      </Link>
    </section>
  );
}

async function invalidateEntityPageData(
  queryClient: ReturnType<typeof useQueryClient>,
  entityId: string
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["entity-page", entityId] }),
    queryClient.invalidateQueries({ queryKey: ["entity-page", "my-rating", entityId] }),
    queryClient.invalidateQueries({ queryKey: ["entity-page", "my-review", entityId] })
  ]);
}

function formatScore(score: number): string {
  return score.toFixed(2);
}

function formatReliabilityPercent(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

function formatRatingReliability(
  t: ReturnType<typeof useTranslation>,
  trust: TrustConfidence
): string {
  return t("rating.confidence", {
    percent: Math.round(trust.confidence * 100)
  });
}

function formatManipulationRiskLabel(
  t: ReturnType<typeof useTranslation>,
  manipulationRisk?: number
): string | null {
  if (manipulationRisk === undefined) {
    return null;
  }

  return `${t("rating.manipulationRisk.label")}: ${Math.round(manipulationRisk * 100)}%`;
}

function formatDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}

function getDistributionCount(
  rating: RatingAggregate,
  score: (typeof RATING_SCORES)[number]
): number {
  return rating.distribution[String(score) as keyof typeof rating.distribution];
}

function buildEntityHref(entityId: string, returnQuery: string): string {
  const path = `/entities/${entityId}`;

  if (!returnQuery) {
    return path;
  }

  return `${path}?q=${encodeURIComponent(returnQuery)}`;
}

function readApiErrorMessage(error: unknown): string | null {
  if (!(error instanceof ApiError)) {
    return null;
  }

  if (error.body && typeof error.body === "object" && "error" in error.body) {
    const apiError = (error.body as { error?: { message?: string } }).error;

    if (apiError?.message) {
      return apiError.message;
    }
  }

  return null;
}

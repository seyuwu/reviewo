"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { FormFeedback } from "../../../components/form-feedback";
import { MinimalAuthPanel } from "../../auth/components/minimal-auth-panel";
import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { ApiError } from "../../../lib/api/api-error";
import {
  getEntityPage,
  getMyRating,
  getMyReview,
  rateEntity,
  upsertMyReview
} from "../api/entity-page";
import type { EntityPageResponse, RatingAggregate, Review } from "../types/entity-page";
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
  const queryClient = useQueryClient();
  const { authSession, isAuthSessionLoaded, signOut, storeAuthSession } = useAuthSession();
  const accessToken = authSession?.accessToken;
  const [selectedScore, setSelectedScore] = useState<number | null>(null);
  const [reviewText, setReviewText] = useState("");
  const [ratingStatusMessage, setRatingStatusMessage] = useState<string | null>(null);
  const [ratingErrorMessage, setRatingErrorMessage] = useState<string | null>(null);
  const [reviewStatusMessage, setReviewStatusMessage] = useState<string | null>(null);
  const [reviewErrorMessage, setReviewErrorMessage] = useState<string | null>(null);
  const hasHydratedReviewRef = useRef(false);

  const entityPageQuery = useQuery({
    queryFn: () => getEntityPage(entityId),
    queryKey: ["entity-page", entityId],
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
        setRatingErrorMessage("Session expired. Sign in again to update your rating.");
        return;
      }

      setRatingErrorMessage(readApiErrorMessage(error) ?? "Rating update failed. Please try again.");
    },
    onSuccess: () => {
      setRatingStatusMessage("Rating saved.");
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
        setReviewErrorMessage("Session expired. Sign in again to update your review.");
        return;
      }

      setReviewErrorMessage(readApiErrorMessage(error) ?? "Review update failed. Please try again.");
    },
    onSuccess: (savedReview) => {
      setReviewStatusMessage("Review saved.");
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

  const pageData = entityPageQuery.data;
  const canInteract = Boolean(accessToken);
  const trimmedReviewText = reviewText.trim();
  const savedReview = myReviewQuery.data;
  const hasSavedReview = Boolean(savedReview?.text?.trim());
  const reviewSaveLabel = hasSavedReview ? "Update review" : "Save review";

  function handleRatingSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRatingStatusMessage(null);
    setRatingErrorMessage(null);

    if (!canInteract) {
      setRatingErrorMessage("Sign in before rating this entity.");
      return;
    }

    if (!selectedScore) {
      setRatingErrorMessage("Choose a score from 1 to 5.");
      return;
    }

    rateMutation.mutate(selectedScore);
  }

  function handleReviewSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReviewStatusMessage(null);
    setReviewErrorMessage(null);

    if (!canInteract) {
      setReviewErrorMessage("Sign in before reviewing this entity.");
      return;
    }

    if (!trimmedReviewText) {
      setReviewErrorMessage("Write a review before submitting.");
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
    <section className="entity-page ui-fade-in" aria-labelledby="entity-page-heading">
      <EntityHero pageData={pageData} returnQuery={returnQuery} />

      <div
        className={`entity-page-grid ${styles.pageGrid}`}
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 26rem)",
          maxWidth: "100%",
          minWidth: 0,
          overflow: "hidden",
          width: "100%"
        }}
      >
        <div className={`entity-page-main ${styles.mainColumn}`}>
          <RatingSummary rating={pageData.rating} />
          <TrustSummary confidence={pageData.trust.confidence} />
          <ReviewsList reviews={pageData.reviews} reviewsCount={pageData.meta.reviewsCount} />
        </div>

        <aside className={`entity-page-aside ${styles.asideColumn}`} aria-label="Your contribution">
          <MinimalAuthPanel
            authSession={authSession}
            contextLabel="Sign in to rate and review"
            onAuthSuccess={(authResponse) => {
              const storedSession = storeAuthSession(authResponse);
              setReviewStatusMessage(`Signed in as ${storedSession.displayName}.`);
              setReviewErrorMessage(null);
            }}
            onSignOut={() => {
              signOut();
              setReviewStatusMessage("Signed out from entity interactions.");
            }}
          />

          <form className={`panel-card form-stack ${styles.constrainedPanel}`} onSubmit={handleRatingSubmit}>
            <div className="section-heading">
              <p className="result-type">Your rating</p>
              <h2>Rate this entity</h2>
            </div>

            <div className="rating-choice-list" aria-label="Choose rating from 1 to 5">
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
              {rateMutation.isPending ? "Saving rating..." : "Save rating"}
            </button>

            <FormFeedback errorMessage={ratingErrorMessage} statusMessage={ratingStatusMessage} />
          </form>

          <form className={`panel-card form-stack ${styles.constrainedPanel}`} onSubmit={handleReviewSubmit}>
            <div className="section-heading">
              <p className="result-type">Your review</p>
              <h2>Share useful context</h2>
            </div>

            {hasSavedReview && savedReview ? (
              <div className={styles.savedReviewPreview} aria-label="Your saved review">
                <p className="result-type">Published on Reviewo</p>
                <div className={styles.reviewTextWrap}>
                  <ReviewTextContent text={savedReview.text} />
                </div>
                <p className="muted-copy">Last updated {formatDate(savedReview.updatedAt)}</p>
              </div>
            ) : null}

            <label className="field-label">
              Review text
              <textarea
                maxLength={MAX_REVIEW_TEXT_LENGTH}
                minLength={1}
                rows={7}
                value={reviewText}
                disabled={!canInteract || reviewMutation.isPending}
                onChange={(event) => {
                  setReviewText(event.target.value);
                }}
              />
            </label>

            <p className={`muted-copy ${styles.reviewLengthCounter}`} aria-live="polite">
              {reviewText.length} / {MAX_REVIEW_TEXT_LENGTH}
            </p>

            <button
              type="submit"
              className="primary-button primary-button-stable-label"
              disabled={!canInteract || !trimmedReviewText || reviewMutation.isPending}
              aria-busy={reviewMutation.isPending}
            >
              {reviewMutation.isPending ? "Saving review..." : reviewSaveLabel}
            </button>

            <FormFeedback errorMessage={reviewErrorMessage} statusMessage={reviewStatusMessage} />
          </form>
        </aside>
      </div>
    </section>
  );
}

function EntityHero({
  pageData,
  returnQuery
}: {
  pageData: EntityPageResponse;
  returnQuery: string;
}) {
  const parentHref = pageData.parent
    ? buildEntityHref(pageData.parent.id, returnQuery)
    : null;

  return (
    <header className="entity-hero">
      <div>
        {pageData.parent ? (
          <nav className="entity-breadcrumb" aria-label="Entity hierarchy">
            <Link className="entity-breadcrumb-link" href={parentHref ?? "#"}>
              {pageData.parent.title}
            </Link>
            <span className="entity-breadcrumb-separator" aria-hidden="true">
              →
            </span>
            <span className="entity-breadcrumb-current">{pageData.entity.title}</span>
          </nav>
        ) : null}
        <p className="eyebrow">{pageData.entity.type}</p>
        <h1 id="entity-page-heading">{pageData.entity.title}</h1>
        <p className="hero-copy">
          {pageData.entity.description ??
            pageData.entity.canonicalUrl ??
            "This entity is ready for public ratings and reviews."}
        </p>
        {pageData.parent ? (
          <p className="entity-parent-link-row">
            <Link className="entity-parent-link" href={parentHref ?? "#"}>
              View site reviews for {pageData.parent.title}
            </Link>
          </p>
        ) : null}
      </div>

      <div className="entity-stat-grid" aria-label="Entity statistics">
        <EntityStat label="Average" value={formatScore(pageData.rating.avgScore)} />
        <EntityStat label="Votes" value={String(pageData.rating.votesCount)} />
        <EntityStat label="Trust" value={formatPercent(pageData.trust.confidence)} />
        <EntityStat label="Reviews" value={String(pageData.meta.reviewsCount)} />
      </div>
    </header>
  );
}

function EntityStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="entity-stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function RatingSummary({ rating }: { rating: RatingAggregate }) {
  const maxVotes = useMemo(
    () => Math.max(...RATING_SCORES.map((score) => getDistributionCount(rating, score)), 1),
    [rating.distribution]
  );

  return (
    <section className={`panel-card entity-section ${styles.constrainedPanel}`} aria-labelledby="rating-summary-heading">
      <div className="section-heading">
        <p className="result-type">Rating</p>
        <h2 id="rating-summary-heading">{formatScore(rating.avgScore)} average score</h2>
      </div>
      <p className="muted-copy">Based on {rating.votesCount} user ratings.</p>

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

function TrustSummary({ confidence }: { confidence: number }) {
  return (
    <section className={`panel-card entity-section ${styles.constrainedPanel}`} aria-labelledby="trust-summary-heading">
      <div className="section-heading">
        <p className="result-type">Trust</p>
        <h2 id="trust-summary-heading">{formatPercent(confidence)} confidence</h2>
      </div>
      <p className="muted-copy">
        MVP confidence is based on rating count and review count. The model is intentionally simple
        and replaceable.
      </p>
      <div className="trust-meter" aria-hidden="true">
        <span style={{ width: `${Math.round(confidence * 100)}%` }} />
      </div>
    </section>
  );
}

function ReviewsList({ reviews, reviewsCount }: { reviews: Review[]; reviewsCount: number }) {
  return (
    <section className={`panel-card entity-section ${styles.constrainedPanel}`} aria-labelledby="reviews-heading">
      <div className="section-heading section-heading-row">
        <div>
          <p className="result-type">Reviews</p>
          <h2 id="reviews-heading">Top reviews</h2>
        </div>
        <span className="result-action">{reviewsCount} total</span>
      </div>

      {reviews.length > 0 ? (
        <div className={`review-list ${styles.reviewList}`}>
          {reviews.map((review) => (
            <article className={`review-card ${styles.reviewCard}`} key={review.id}>
              <ReviewTextContent text={review.text} />
              <div className="review-meta">
                <span>{review.likesCount} likes</span>
                <span>Updated {formatDate(review.updatedAt)}</span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="muted-copy">No reviews yet. Be the first to add useful context.</p>
      )}
    </section>
  );
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
          <div className="panel-card auth-form-skeleton">
            <div className="ui-skeleton ui-skeleton-segment" />
            <div className="ui-skeleton ui-skeleton-field" />
            <div className="ui-skeleton ui-skeleton-field" />
            <div className="ui-skeleton ui-skeleton-button" />
          </div>
        </aside>
      </div>
    </section>
  );
}

function EntityPageErrorState({ returnQuery }: { returnQuery: string }) {
  const searchHref = returnQuery ? `/?q=${encodeURIComponent(returnQuery)}` : "/";

  return (
    <section className="creation-card entity-placeholder-card ui-fade-in">
      <p className="eyebrow">Entity page</p>
      <h1>Entity page is unavailable.</h1>
      <p className="hero-copy">
        The entity may not exist or the API may be temporarily unavailable.
      </p>
      <Link className="entity-back-button" href={searchHref}>
        ← Назад к поиску
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

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
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

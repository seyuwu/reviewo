"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { MinimalAuthPanel } from "../../auth/components/minimal-auth-panel";
import { useAuthSession } from "../../auth/hooks/use-auth-session";
import {
  getEntityPage,
  getMyRating,
  getMyReview,
  rateEntity,
  upsertMyReview
} from "../api/entity-page";
import type { EntityPageResponse, RatingAggregate, Review } from "../types/entity-page";

const RATING_SCORES = [1, 2, 3, 4, 5] as const;

interface EntityPageViewProps {
  entityId: string;
}

export function EntityPageView({ entityId }: EntityPageViewProps) {
  const queryClient = useQueryClient();
  const { authSession, isAuthSessionLoaded, signOut, storeAuthSession } = useAuthSession();
  const accessToken = authSession?.accessToken;
  const [selectedScore, setSelectedScore] = useState<number | null>(null);
  const [reviewText, setReviewText] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const entityPageQuery = useQuery({
    queryFn: () => getEntityPage(entityId),
    queryKey: ["entity-page", entityId]
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
    onError: () => {
      setErrorMessage("Rating update failed. Please try again.");
    },
    onSuccess: async () => {
      setStatusMessage("Rating saved.");
      setErrorMessage(null);
      await invalidateEntityPageData(queryClient, entityId);
    }
  });

  const reviewMutation = useMutation({
    mutationFn: (text: string) => {
      if (!accessToken) {
        throw new Error("Missing auth token");
      }

      return upsertMyReview(entityId, text, accessToken);
    },
    onError: () => {
      setErrorMessage("Review update failed. Please try again.");
    },
    onSuccess: async () => {
      setStatusMessage("Review saved.");
      setErrorMessage(null);
      await invalidateEntityPageData(queryClient, entityId);
    }
  });

  useEffect(() => {
    setSelectedScore(myRatingQuery.data?.score ?? null);
  }, [myRatingQuery.data?.score]);

  useEffect(() => {
    if (myReviewQuery.data?.text) {
      setReviewText(myReviewQuery.data.text);
    }
  }, [myReviewQuery.data?.text]);

  const pageData = entityPageQuery.data;
  const canInteract = Boolean(accessToken);
  const trimmedReviewText = reviewText.trim();
  const isSubmitting = rateMutation.isPending || reviewMutation.isPending;

  function handleRatingSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatusMessage(null);
    setErrorMessage(null);

    if (!canInteract) {
      setErrorMessage("Sign in before rating this entity.");
      return;
    }

    if (!selectedScore) {
      setErrorMessage("Choose a score from 1 to 5.");
      return;
    }

    rateMutation.mutate(selectedScore);
  }

  function handleReviewSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatusMessage(null);
    setErrorMessage(null);

    if (!canInteract) {
      setErrorMessage("Sign in before reviewing this entity.");
      return;
    }

    if (!trimmedReviewText) {
      setErrorMessage("Write a review before submitting.");
      return;
    }

    reviewMutation.mutate(trimmedReviewText);
  }

  if (entityPageQuery.isLoading) {
    return <EntityPageLoadingState />;
  }

  if (entityPageQuery.isError || !pageData) {
    return <EntityPageErrorState />;
  }

  return (
    <section className="entity-page" aria-labelledby="entity-page-heading">
      <EntityHero pageData={pageData} />

      <div className="entity-page-grid">
        <div className="entity-page-main">
          <RatingSummary rating={pageData.rating} />
          <TrustSummary confidence={pageData.trust.confidence} />
          <ReviewsList reviews={pageData.reviews} reviewsCount={pageData.meta.reviewsCount} />
        </div>

        <aside className="entity-page-aside" aria-label="Your contribution">
          <MinimalAuthPanel
            authSession={authSession}
            contextLabel="Sign in to rate and review"
            onAuthSuccess={(authResponse) => {
              const storedSession = storeAuthSession(authResponse);
              setStatusMessage(`Signed in as ${storedSession.displayName}.`);
              setErrorMessage(null);
            }}
            onSignOut={() => {
              signOut();
              setStatusMessage("Signed out from entity interactions.");
            }}
          />

          <form className="panel-card form-stack" onSubmit={handleRatingSubmit}>
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
                  disabled={!canInteract || !isAuthSessionLoaded || isSubmitting}
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
              className="primary-button"
              disabled={!canInteract || !selectedScore || isSubmitting}
            >
              {rateMutation.isPending ? "Saving rating..." : "Save rating"}
            </button>
          </form>

          <form className="panel-card form-stack" onSubmit={handleReviewSubmit}>
            <div className="section-heading">
              <p className="result-type">Your review</p>
              <h2>Share useful context</h2>
            </div>

            <label className="field-label">
              Review text
              <textarea
                maxLength={5000}
                minLength={1}
                rows={7}
                value={reviewText}
                disabled={!canInteract || isSubmitting}
                onChange={(event) => {
                  setReviewText(event.target.value);
                }}
              />
            </label>

            <button
              type="submit"
              className="primary-button"
              disabled={!canInteract || !trimmedReviewText || isSubmitting}
            >
              {reviewMutation.isPending ? "Saving review..." : "Save review"}
            </button>
          </form>

          <div className="form-feedback" aria-live="polite">
            {statusMessage ? <p className="success-message">{statusMessage}</p> : null}
            {errorMessage ? <p className="error-message">{errorMessage}</p> : null}
          </div>
        </aside>
      </div>
    </section>
  );
}

function EntityHero({ pageData }: { pageData: EntityPageResponse }) {
  return (
    <header className="entity-hero">
      <div>
        <p className="eyebrow">{pageData.entity.type}</p>
        <h1 id="entity-page-heading">{pageData.entity.title}</h1>
        <p className="hero-copy">
          {pageData.entity.description ??
            pageData.entity.canonicalUrl ??
            "This entity is ready for public ratings and reviews."}
        </p>
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
    <section className="panel-card entity-section" aria-labelledby="rating-summary-heading">
      <div className="section-heading">
        <p className="result-type">Rating</p>
        <h2 id="rating-summary-heading">{formatScore(rating.avgScore)} average score</h2>
      </div>
      <p className="muted-copy">Based on {rating.votesCount} user ratings.</p>

      <div className="rating-breakdown">
        {[...RATING_SCORES].reverse().map((score) => {
          const count = getDistributionCount(rating, score);
          const widthPercent = Math.round((count / maxVotes) * 100);

          return (
            <div className="rating-breakdown-row" key={score}>
              <span>{score}</span>
              <div className="rating-bar" aria-hidden="true">
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
    <section className="panel-card entity-section" aria-labelledby="trust-summary-heading">
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
    <section className="panel-card entity-section" aria-labelledby="reviews-heading">
      <div className="section-heading section-heading-row">
        <div>
          <p className="result-type">Reviews</p>
          <h2 id="reviews-heading">Top reviews</h2>
        </div>
        <span className="result-action">{reviewsCount} total</span>
      </div>

      {reviews.length > 0 ? (
        <div className="review-list">
          {reviews.map((review) => (
            <article className="review-card" key={review.id}>
              <p>{review.text}</p>
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

function EntityPageLoadingState() {
  return (
    <section className="creation-card entity-placeholder-card">
      <p className="eyebrow">Entity page</p>
      <h1>Loading entity data.</h1>
      <p className="hero-copy">
        Fetching rating, trust, and reviews from the backend composition API.
      </p>
    </section>
  );
}

function EntityPageErrorState() {
  return (
    <section className="creation-card entity-placeholder-card">
      <p className="eyebrow">Entity page</p>
      <h1>Entity page is unavailable.</h1>
      <p className="hero-copy">
        The entity may not exist or the API may be temporarily unavailable.
      </p>
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

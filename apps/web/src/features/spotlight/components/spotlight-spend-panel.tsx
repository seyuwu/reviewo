"use client";

import Link from "next/link";
import { FormEvent, useEffect, useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError } from "../../../lib/api/api-error";
import { readApiErrorMessage, readValidationErrors } from "../../../lib/api/read-api-error";
import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { getMyReview } from "../../entity-page/api/entity-page";
import { fetchContributeQueues } from "../../contribute/api/contribute-api";
import type { ContributeQueueItem } from "../../contribute/types/contribute";
import { useEntitySearch } from "../../home-search/hooks/use-entity-search";
import type { SearchEntityResult } from "../../home-search/types/search-entities";
import { useLocale, useTranslation } from "../../i18n/locale-provider";
import type { ContentLocaleParam } from "../../i18n/content-locale";
import { fetchTopsByAuthor } from "../../tops/api/tops-api";
import type { TopListItem } from "../../tops/types/tops";
import {
  fetchMySpotlightCredits,
  fetchSpotlightCosts,
  spendSpotlightOnBattle,
  spendSpotlightOnEntity,
  spendSpotlightOnTop
} from "../api/spotlight-api";
import {
  formatSpotlightDurationLabel,
  resolveSpotlightDurationHours
} from "../lib/resolve-spotlight-duration";
import type { SpotlightFeedResponse, SpotlightSpendFormKey } from "../types/spotlight";

type SpendErrorKind = "balance" | "generic" | "limit" | "notFound" | "pitch" | "trust" | null;

const SPOTLIGHT_PITCH_MESSAGE_MIN = 10;
const SPOTLIGHT_PITCH_MESSAGE_MAX = 280;

type EntityPitchMode = "message" | "review";

interface SpotlightSpendPanelProps {
  activeForm: SpotlightSpendFormKey | null;
  inModal?: boolean;
  onSpendSuccess?: () => void;
}

export function SpotlightSpendPanel({
  activeForm,
  inModal = false,
  onSpendSuccess
}: SpotlightSpendPanelProps) {
  const t = useTranslation();
  const { resolvedLocale } = useLocale();
  const queryClient = useQueryClient();
  const { authSession, isAuthSessionLoaded } = useAuthSession();
  const accessToken = authSession?.accessToken;
  const userId = authSession?.userId;
  const contentLocale = (resolvedLocale === "ru" || resolvedLocale === "en"
    ? resolvedLocale
    : "ru") as ContentLocaleParam;

  const costsQuery = useQuery({
    queryFn: fetchSpotlightCosts,
    queryKey: ["spotlight-costs"]
  });

  const creditsQuery = useQuery({
    enabled: Boolean(accessToken),
    queryFn: () => fetchMySpotlightCredits(accessToken ?? ""),
    queryKey: ["spotlight-credits", accessToken]
  });

  const battlesQuery = useQuery({
    queryFn: () => fetchContributeQueues(12),
    queryKey: ["spotlight-battle-options"]
  });

  const topsQuery = useQuery({
    enabled: Boolean(userId),
    queryFn: () => fetchTopsByAuthor(userId ?? "", 20, undefined, contentLocale),
    queryKey: ["spotlight-user-tops", userId, contentLocale]
  });

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<SpendErrorKind>(null);
  const [entityCredits, setEntityCredits] = useState(10);
  const [battleCredits, setBattleCredits] = useState(15);
  const [topCredits, setTopCredits] = useState(20);

  const minTrustPercent = formatTrustPercent(costsQuery.data?.minTrustScore ?? 0.35);
  const creditBalance = creditsQuery.data?.balance ?? 0;
  const activePlacements = creditsQuery.data?.activePlacements ?? 0;
  const maxActivePlacements =
    creditsQuery.data?.maxActivePlacements ?? costsQuery.data?.maxActivePlacements ?? 5;
  const isPlacementLimitReached = activePlacements >= maxActivePlacements;
  const entityMinCost = costsQuery.data?.entity_spotlight ?? 10;
  const battleMinCost = costsQuery.data?.battle_boost ?? 15;
  const topMinCost = costsQuery.data?.top_highlight ?? 20;
  const hoursPerCredit = costsQuery.data?.hoursPerCredit ?? 2;
  const maxSpendPerRequest = costsQuery.data?.maxSpendPerRequest ?? 200;

  useEffect(() => {
    if (creditBalance <= 0) {
      return;
    }

    setEntityCredits((current) => clampCredits(current, entityMinCost, creditBalance, maxSpendPerRequest));
    setBattleCredits((current) => clampCredits(current, battleMinCost, creditBalance, maxSpendPerRequest));
    setTopCredits((current) => clampCredits(current, topMinCost, creditBalance, maxSpendPerRequest));
  }, [battleMinCost, creditBalance, entityMinCost, maxSpendPerRequest, topMinCost]);

  const prependPlacementToFeed = (placement: SpotlightFeedResponse["items"][number]) => {
    queryClient.setQueriesData<SpotlightFeedResponse>({ queryKey: ["spotlight-feed"] }, (current) => ({
      items: [
        placement,
        ...(current?.items ?? []).filter((item) => item.placementId !== placement.placementId)
      ]
    }));
  };

  const invalidateSpotlight = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["spotlight-credits"] }),
      queryClient.invalidateQueries({ queryKey: ["spotlight-feed"] })
    ]);
  };

  const spendEntityMutation = useMutation({
    mutationFn: ({
      credits,
      entityId,
      message
    }: {
      credits: number;
      entityId: string;
      message?: string;
    }) => spendSpotlightOnEntity(accessToken ?? "", entityId, credits, message, contentLocale),
    onError: (error) => {
      setStatusMessage(null);
      setErrorKind(readSpendErrorKind(error));
    },
    onSuccess: async (response) => {
      setErrorKind(null);
      setStatusMessage(t("web.spotlight.spendSuccess"));
      prependPlacementToFeed(response.placement);
      await invalidateSpotlight();
      onSpendSuccess?.();
    }
  });

  const spendBattleMutation = useMutation({
    mutationFn: ({ credits, pairSlug }: { credits: number; pairSlug: string }) =>
      spendSpotlightOnBattle(accessToken ?? "", pairSlug, credits, contentLocale),
    onError: (error) => {
      setStatusMessage(null);
      setErrorKind(readSpendErrorKind(error));
    },
    onSuccess: async (response) => {
      setErrorKind(null);
      setStatusMessage(t("web.spotlight.spendSuccess"));
      prependPlacementToFeed(response.placement);
      await invalidateSpotlight();
      onSpendSuccess?.();
    }
  });

  const spendTopMutation = useMutation({
    mutationFn: ({ credits, topId }: { credits: number; topId: string }) =>
      spendSpotlightOnTop(accessToken ?? "", topId, credits, contentLocale),
    onError: (error) => {
      setStatusMessage(null);
      setErrorKind(readSpendErrorKind(error));
    },
    onSuccess: async (response) => {
      setErrorKind(null);
      setStatusMessage(t("web.spotlight.spendSuccess"));
      prependPlacementToFeed(response.placement);
      await invalidateSpotlight();
      onSpendSuccess?.();
    }
  });

  if (!isAuthSessionLoaded) {
    return null;
  }

  if (!accessToken) {
    return (
      <div className={inModal ? "spotlight-spend-guest" : "panel-card spotlight-spend-card"}>
        <p className="muted-copy">{t("web.spotlight.spendGuest")}</p>
      </div>
    );
  }

  if (!activeForm) {
    return null;
  }

  const battleItems =
    battlesQuery.data?.queues.find((queue) => queue.key === "low_activity_battles")?.items ?? [];
  const topItems = topsQuery.data?.items ?? [];

  const panelContent = (
    <>
      {!inModal ? (
        <div className="section-heading">
          <p className="result-type">{t("web.spotlight.spendEyebrow")}</p>
          <h2>{t("web.spotlight.spendTitle")}</h2>
        </div>
      ) : null}

      {isPlacementLimitReached ? (
        <p className="error-message spotlight-spend-limit-hint">
          {t("web.spotlight.spendPlacementLimitHint", { max: String(maxActivePlacements) })}
        </p>
      ) : null}

      <div className="spotlight-spend-grid spotlight-spend-grid--single">
        {activeForm === "entity" ? (
          <EntitySpendCard
            accessToken={accessToken ?? ""}
            balance={creditBalance}
            contentLocale={contentLocale}
            cost={entityCredits}
            hoursPerCredit={hoursPerCredit}
            isPending={spendEntityMutation.isPending}
            isPlacementLimitReached={isPlacementLimitReached}
            maxSpend={maxSpendPerRequest}
            minCost={entityMinCost}
            selectedCredits={entityCredits}
            onCreditsChange={setEntityCredits}
            onSpend={({ entityId, message }) =>
              spendEntityMutation.mutate({
                credits: entityCredits,
                entityId,
                ...(message ? { message } : {})
              })
            }
          />
        ) : null}

        {activeForm === "battle" ? (
          <BattleSpendCard
            balance={creditBalance}
            battles={battleItems}
            cost={battleCredits}
            hoursPerCredit={hoursPerCredit}
            isLoading={battlesQuery.isLoading}
            isPending={spendBattleMutation.isPending}
            isPlacementLimitReached={isPlacementLimitReached}
            maxSpend={maxSpendPerRequest}
            minCost={battleMinCost}
            selectedCredits={battleCredits}
            onCreditsChange={setBattleCredits}
            onSpend={(pairSlug) => spendBattleMutation.mutate({ credits: battleCredits, pairSlug })}
          />
        ) : null}

        {activeForm === "top" ? (
          <TopSpendCard
            balance={creditBalance}
            cost={topCredits}
            hoursPerCredit={hoursPerCredit}
            isLoading={topsQuery.isLoading}
            isPending={spendTopMutation.isPending}
            isPlacementLimitReached={isPlacementLimitReached}
            maxSpend={maxSpendPerRequest}
            minCost={topMinCost}
            onSpend={(topId) => spendTopMutation.mutate({ credits: topCredits, topId })}
            selectedCredits={topCredits}
            onCreditsChange={setTopCredits}
            tops={topItems}
          />
        ) : null}
      </div>

      <SpotlightSpendFeedback
        errorKind={errorKind}
        maxActivePlacements={maxActivePlacements}
        minTrustPercent={minTrustPercent}
        statusMessage={statusMessage}
      />
    </>
  );

  if (inModal) {
    return <div className="spotlight-spend-modal-body">{panelContent}</div>;
  }

  return (
    <div className="panel-card spotlight-spend-card" id="spotlight-spend-panel">
      {panelContent}
    </div>
  );
}

function SpotlightSpendFeedback({
  errorKind,
  maxActivePlacements,
  minTrustPercent,
  statusMessage
}: {
  errorKind: SpendErrorKind;
  maxActivePlacements: number;
  minTrustPercent: string;
  statusMessage: string | null;
}) {
  const t = useTranslation();
  const isVisible = Boolean(errorKind || statusMessage);

  return (
    <div
      className={`form-feedback-slot form-feedback-area${isVisible ? " is-visible" : ""}`}
      aria-live="polite"
    >
      <div className="form-feedback-slot__inner">
        {statusMessage ? <p className="success-message">{statusMessage}</p> : null}
        {errorKind === "trust" ? (
          <p className="error-message">
            {t("web.spotlight.spendError.trustBefore")}{" "}
            <Link className="spotlight-trust-score-link" href="/profile#trust">
              {t("web.profile.trustScoreLabel")}
            </Link>
            . {t("web.spotlight.spendError.trustAfter", { min: minTrustPercent })}
          </p>
        ) : null}
        {errorKind === "balance" ? (
          <p className="error-message">{t("web.spotlight.spendError.balance")}</p>
        ) : null}
        {errorKind === "limit" ? (
          <p className="error-message">
            {t("web.spotlight.spendError.limit", { max: String(maxActivePlacements) })}
          </p>
        ) : null}
        {errorKind === "notFound" ? (
          <p className="error-message">{t("web.spotlight.spendError.notFound")}</p>
        ) : null}
        {errorKind === "pitch" ? (
          <p className="error-message">{t("web.spotlight.spendError.pitch")}</p>
        ) : null}
        {errorKind === "generic" ? (
          <p className="error-message">{t("web.spotlight.spendError.generic")}</p>
        ) : null}
      </div>
    </div>
  );
}

function EntitySpendCard({
  accessToken,
  balance,
  contentLocale,
  cost,
  hoursPerCredit,
  isPending,
  isPlacementLimitReached,
  minCost,
  maxSpend,
  selectedCredits,
  onCreditsChange,
  onSpend
}: {
  accessToken: string;
  balance: number;
  contentLocale: ContentLocaleParam;
  cost: number;
  hoursPerCredit: number;
  isPending: boolean;
  isPlacementLimitReached: boolean;
  maxSpend: number;
  minCost: number;
  selectedCredits: number;
  onCreditsChange: (credits: number) => void;
  onSpend: (input: { entityId: string; message?: string }) => void;
}) {
  const t = useTranslation();
  const inputId = useId();
  const messageFieldId = useId();
  const [query, setQuery] = useState("");
  const [selectedEntity, setSelectedEntity] = useState<SearchEntityResult | null>(null);
  const [pitchMode, setPitchMode] = useState<EntityPitchMode>("message");
  const [customMessage, setCustomMessage] = useState("");
  const { data, debouncedQuery, isDebouncing, isError, isFetching, isPending: isSearchPending, trimmedQuery } =
    useEntitySearch(query);

  const pastedEntityId = parseEntityIdFromInput(trimmedQuery);
  const resolvedEntityId = selectedEntity?.id ?? pastedEntityId;
  const results = (data?.results ?? []).slice(0, 6);

  const myReviewQuery = useQuery({
    enabled: Boolean(resolvedEntityId),
    queryFn: () => getMyReview(resolvedEntityId ?? "", accessToken, contentLocale),
    queryKey: ["spotlight-entity-my-review", resolvedEntityId, accessToken, contentLocale]
  });

  const reviewText = myReviewQuery.data?.text?.trim() ?? "";
  const hasReview = reviewText.length > 0;
  const trimmedCustomMessage = customMessage.trim();
  const canUseReviewPitch = hasReview && pitchMode === "review";
  const canUseMessagePitch =
    pitchMode === "message" &&
    trimmedCustomMessage.length >= SPOTLIGHT_PITCH_MESSAGE_MIN &&
    trimmedCustomMessage.length <= SPOTLIGHT_PITCH_MESSAGE_MAX;
  const canSpend = Boolean(resolvedEntityId) && (canUseReviewPitch || canUseMessagePitch);

  useEffect(() => {
    if (!resolvedEntityId) {
      setPitchMode("message");
      setCustomMessage("");
      return;
    }

    if (hasReview) {
      setPitchMode("review");
    } else {
      setPitchMode("message");
    }
  }, [hasReview, resolvedEntityId]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!resolvedEntityId || !canSpend) {
      return;
    }

    onSpend({
      entityId: resolvedEntityId,
      ...(pitchMode === "message" ? { message: trimmedCustomMessage } : {})
    });
    setSelectedEntity(null);
    setQuery("");
    setCustomMessage("");
    setPitchMode("message");
  }

  return (
    <form className="spotlight-spend-form form-stack" onSubmit={handleSubmit}>
      <div>
        <h3>{t("web.spotlight.spendEntityTitle")}</h3>
        <p className="muted-copy spotlight-spend-copy">{t("web.spotlight.spendEntityDescription")}</p>
      </div>

      {selectedEntity ? (
        <SelectedChip
          label={selectedEntity.title}
          onClear={() => {
            setSelectedEntity(null);
            setCustomMessage("");
          }}
        />
      ) : (
        <>
          <label className="field-label" htmlFor={inputId}>
            <span>{t("web.spotlight.spendEntitySearchLabel")}</span>
            <input
              id={inputId}
              placeholder={t("web.spotlight.spendEntitySearchPlaceholder")}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <small>{t("web.spotlight.spendEntitySearchHint")}</small>
          </label>

          {pastedEntityId && trimmedQuery ? (
            <p className="spotlight-spend-paste-ok muted-copy">{t("web.spotlight.spendEntityPasteOk")}</p>
          ) : null}

          {trimmedQuery && !pastedEntityId ? (
            <div className="spotlight-picker-list" aria-live="polite">
              {isDebouncing || isSearchPending || isFetching ? (
                <p className="muted-copy">{t("web.home.searching")}</p>
              ) : null}
              {isError ? <p className="muted-copy">{t("web.home.searchError")}</p> : null}
              {!isDebouncing && !isSearchPending && results.length === 0 && debouncedQuery ? (
                <p className="muted-copy">{t("web.home.noResults", { query: debouncedQuery })}</p>
              ) : null}
              {results.map((result) => (
                <button
                  key={result.id}
                  className="spotlight-picker-option"
                  type="button"
                  onClick={() => {
                    setSelectedEntity(result);
                    setQuery("");
                  }}
                >
                  <strong>{result.title}</strong>
                  <span>{result.slug}</span>
                </button>
              ))}
            </div>
          ) : null}
        </>
      )}

      {resolvedEntityId ? (
        <div className="spotlight-pitch-picker">
          <p className="spotlight-pitch-picker-label">{t("web.spotlight.spendEntityPitchLabel")}</p>
          <div className="spotlight-pitch-grid">
            <button
              aria-pressed={pitchMode === "review"}
              className={
                pitchMode === "review" ? "spotlight-pitch-card is-selected" : "spotlight-pitch-card"
              }
              disabled={!hasReview && myReviewQuery.isFetched}
              type="button"
              onClick={() => setPitchMode("review")}
            >
              <p className="spotlight-pitch-card-title">{t("web.spotlight.spendEntityPitchReview")}</p>
              {myReviewQuery.isLoading ? (
                <p className="spotlight-pitch-card-excerpt muted-copy">{t("common.loadingEllipsis")}</p>
              ) : hasReview ? (
                <p className="spotlight-pitch-card-excerpt">"{truncatePitchPreview(reviewText)}"</p>
              ) : (
                <p className="spotlight-pitch-card-excerpt muted-copy">
                  {t("web.spotlight.spendEntityPitchReviewEmpty")}
                </p>
              )}
            </button>

            <button
              aria-pressed={pitchMode === "message"}
              className={
                pitchMode === "message" ? "spotlight-pitch-card is-selected" : "spotlight-pitch-card"
              }
              type="button"
              onClick={() => setPitchMode("message")}
            >
              <p className="spotlight-pitch-card-title">{t("web.spotlight.spendEntityPitchMessage")}</p>
              <p className="spotlight-pitch-card-excerpt muted-copy">
                {t("web.spotlight.spendEntityPitchMessageHint", {
                  max: String(SPOTLIGHT_PITCH_MESSAGE_MAX)
                })}
              </p>
            </button>
          </div>

          {pitchMode === "message" ? (
            <label className="field-label spotlight-pitch-message-field" htmlFor={messageFieldId}>
              <textarea
                id={messageFieldId}
                maxLength={SPOTLIGHT_PITCH_MESSAGE_MAX}
                placeholder={t("web.spotlight.spendEntityPitchMessagePlaceholder")}
                rows={3}
                value={customMessage}
                onChange={(event) => setCustomMessage(event.target.value)}
              />
              <p className="spotlight-pitch-message-count">
                {t("web.spotlight.spendEntityPitchMessageCount", {
                  current: String(trimmedCustomMessage.length),
                  max: String(SPOTLIGHT_PITCH_MESSAGE_MAX)
                })}
              </p>
            </label>
          ) : null}
        </div>
      ) : null}

      <SpotlightCreditsSlider
        balance={balance}
        hoursPerCredit={hoursPerCredit}
        maxSpend={maxSpend}
        minCost={minCost}
        selectedCredits={selectedCredits}
        onCreditsChange={onCreditsChange}
      />

      <button
        className="secondary-button"
        disabled={
          isPending ||
          isPlacementLimitReached ||
          !canSpend ||
          selectedCredits > balance ||
          balance < minCost
        }
        type="submit"
      >
        {t("web.spotlight.spendEntityAction", { cost: String(cost) })}
      </button>
    </form>
  );
}

function BattleSpendCard({
  balance,
  battles,
  cost,
  hoursPerCredit,
  isLoading,
  isPending,
  isPlacementLimitReached,
  maxSpend,
  minCost,
  selectedCredits,
  onCreditsChange,
  onSpend
}: {
  balance: number;
  battles: ContributeQueueItem[];
  cost: number;
  hoursPerCredit: number;
  isLoading: boolean;
  isPending: boolean;
  isPlacementLimitReached: boolean;
  maxSpend: number;
  minCost: number;
  selectedCredits: number;
  onCreditsChange: (credits: number) => void;
  onSpend: (pairSlug: string) => void;
}) {
  const t = useTranslation();
  const [selectedPairSlug, setSelectedPairSlug] = useState<string>("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedPairSlug) {
      return;
    }

    onSpend(selectedPairSlug);
    setSelectedPairSlug("");
  }

  return (
    <form className="spotlight-spend-form form-stack" onSubmit={handleSubmit}>
      <div>
        <h3>{t("web.spotlight.spendBattleTitle")}</h3>
        <p className="muted-copy spotlight-spend-copy">{t("web.spotlight.spendBattleDescription")}</p>
      </div>

      {isLoading ? <p className="muted-copy">{t("common.loadingEllipsis")}</p> : null}

      {!isLoading && battles.length === 0 ? (
        <p className="muted-copy">
          {t("web.spotlight.spendBattleEmpty")}{" "}
          <Link className="primary-link" href="/battles">
            {t("web.spotlight.spendBattleEmptyLink")}
          </Link>
        </p>
      ) : null}

      {battles.length > 0 ? (
        <div className="spotlight-picker-list">
          {battles.map((battle) => {
            const pairSlug = battle.pairSlug ?? battle.href.replace(/^\/compare\//, "");
            const isSelected = selectedPairSlug === pairSlug;

            return (
              <button
                key={pairSlug}
                aria-pressed={isSelected}
                className={isSelected ? "spotlight-picker-option is-selected" : "spotlight-picker-option"}
                type="button"
                onClick={() => setSelectedPairSlug(pairSlug)}
              >
                <strong>{battle.title}</strong>
                {battle.totalVotes !== undefined ? (
                  <span>{t("web.contribute.battleVotes", { count: String(battle.totalVotes) })}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      <SpotlightCreditsSlider
        balance={balance}
        hoursPerCredit={hoursPerCredit}
        maxSpend={maxSpend}
        minCost={minCost}
        selectedCredits={selectedCredits}
        onCreditsChange={onCreditsChange}
      />

      <button
        className="secondary-button"
        disabled={
          isPending ||
          isPlacementLimitReached ||
          !selectedPairSlug ||
          selectedCredits > balance ||
          balance < minCost
        }
        type="submit"
      >
        {t("web.spotlight.spendBattleAction", { cost: String(cost) })}
      </button>
    </form>
  );
}

function TopSpendCard({
  balance,
  cost,
  hoursPerCredit,
  isLoading,
  isPending,
  isPlacementLimitReached,
  maxSpend,
  minCost,
  onSpend,
  selectedCredits,
  onCreditsChange,
  tops
}: {
  balance: number;
  cost: number;
  hoursPerCredit: number;
  isLoading: boolean;
  isPending: boolean;
  isPlacementLimitReached: boolean;
  maxSpend: number;
  minCost: number;
  onSpend: (topId: string) => void;
  selectedCredits: number;
  onCreditsChange: (credits: number) => void;
  tops: TopListItem[];
}) {
  const t = useTranslation();
  const selectId = useId();
  const [selectedTopId, setSelectedTopId] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedTopId) {
      return;
    }

    onSpend(selectedTopId);
    setSelectedTopId("");
  }

  return (
    <form className="spotlight-spend-form form-stack" onSubmit={handleSubmit}>
      <div>
        <h3>{t("web.spotlight.spendTopTitle")}</h3>
        <p className="muted-copy spotlight-spend-copy">{t("web.spotlight.spendTopDescription")}</p>
      </div>

      {isLoading ? <p className="muted-copy">{t("common.loadingEllipsis")}</p> : null}

      {!isLoading && tops.length === 0 ? (
        <p className="muted-copy">
          {t("web.spotlight.spendTopEmpty")}{" "}
          <Link className="primary-link" href="/tops/new">
            {t("web.spotlight.spendTopEmptyLink")}
          </Link>
        </p>
      ) : null}

      {tops.length > 0 ? (
        <label className="field-label" htmlFor={selectId}>
          <span>{t("web.spotlight.spendTopSelectLabel")}</span>
          <select
            id={selectId}
            value={selectedTopId}
            onChange={(event) => setSelectedTopId(event.target.value)}
          >
            <option value="">{t("web.spotlight.spendTopSelectPlaceholder")}</option>
            {tops.map((top) => (
              <option key={top.id} value={top.id}>
                {top.title}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <SpotlightCreditsSlider
        balance={balance}
        hoursPerCredit={hoursPerCredit}
        maxSpend={maxSpend}
        minCost={minCost}
        selectedCredits={selectedCredits}
        onCreditsChange={onCreditsChange}
      />

      <button
        className="secondary-button"
        disabled={
          isPending ||
          isPlacementLimitReached ||
          !selectedTopId ||
          selectedCredits > balance ||
          balance < minCost
        }
        type="submit"
      >
        {t("web.spotlight.spendTopAction", { cost: String(cost) })}
      </button>
    </form>
  );
}

function SpotlightCreditsSlider({
  balance,
  hoursPerCredit,
  maxSpend,
  minCost,
  onCreditsChange,
  selectedCredits
}: {
  balance: number;
  hoursPerCredit: number;
  maxSpend: number;
  minCost: number;
  onCreditsChange: (credits: number) => void;
  selectedCredits: number;
}) {
  const t = useTranslation();
  const sliderId = useId();
  const maxCredits = Math.max(minCost, Math.min(balance, maxSpend));
  const durationHours = resolveSpotlightDurationHours(selectedCredits, hoursPerCredit);
  const durationLabel = formatSpotlightDurationLabel(durationHours, t);
  const sliderDisabled = balance < minCost;

  return (
    <div className="spotlight-credits-slider">
      <label className="field-label" htmlFor={sliderId}>
        <span>{t("web.spotlight.spendCreditsLabel")}</span>
        <input
          className="spotlight-credits-slider-input"
          disabled={sliderDisabled}
          id={sliderId}
          max={maxCredits}
          min={minCost}
          step={1}
          type="range"
          value={selectedCredits}
          onChange={(event) => {
            onCreditsChange(Number.parseInt(event.target.value, 10));
          }}
        />
      </label>
      <p className="spotlight-credits-slider-summary">
        {t("web.spotlight.spendCreditsSummary", {
          credits: String(selectedCredits),
          duration: durationLabel
        })}
      </p>
      <p className="muted-copy spotlight-credits-slider-hint">
        {t("web.spotlight.spendCreditsRateHint", { hours: String(hoursPerCredit) })}
      </p>
    </div>
  );
}

function clampCredits(value: number, min: number, balance: number, maxSpend: number): number {
  const max = Math.max(min, Math.min(balance, maxSpend));
  return Math.min(Math.max(value, min), max);
}

function SelectedChip({ label, onClear }: { label: string; onClear: () => void }) {
  const t = useTranslation();

  return (
    <div className="spotlight-selected-chip">
      <span>{label}</span>
      <button className="spotlight-selected-chip-clear" type="button" onClick={onClear}>
        {t("web.spotlight.clearSelection")}
      </button>
    </div>
  );
}

function parseEntityIdFromInput(value: string): string | null {
  const trimmed = value.trim();
  const fromUrl = trimmed.match(/\/entities\/([0-9a-f-]{36})/i);

  if (fromUrl?.[1]) {
    return fromUrl[1];
  }

  if (/^[0-9a-f-]{36}$/i.test(trimmed)) {
    return trimmed;
  }

  return null;
}

function readSpendErrorKind(error: unknown): SpendErrorKind {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return "trust";
    }

    if (error.status === 400) {
      const message = readApiErrorMessage(error.body)?.toLowerCase() ?? "";
      const validationErrors = readValidationErrors(error.body);

      if (message.includes("insufficient spotlight credits")) {
        return "balance";
      }

      if (message.includes("active spotlight placements")) {
        return "limit";
      }

      if (
        message.includes("add a review") ||
        message.includes("recommendation message") ||
        validationErrors.some((item) => item.path === "message")
      ) {
        return "pitch";
      }

      return "generic";
    }

    if (error.status === 404) {
      return "notFound";
    }
  }

  return "generic";
}

function truncatePitchPreview(text: string, maxLength = 120): string {
  const trimmed = text.trim();

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength - 1).trimEnd()}…`;
}

function formatTrustPercent(score: number): string {
  return `${Math.round(score * 100)}%`;
}

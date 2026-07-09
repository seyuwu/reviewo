"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { FormEvent, useMemo, useState, type ReactNode } from "react";

import { FormFeedback } from "../../../components/form-feedback";
import { ApiError } from "../../../lib/api/api-error";
import { readApiErrorMessage } from "../../../lib/api/read-api-error";
import { useTranslation } from "../../i18n/locale-provider";
import { ENTITY_TYPES, formatEntityTypeLabel } from "../../i18n/entity-type-label";
import { formatContributionTypeLabel } from "../../i18n/contribution-type-label";
import { formatContributionSummary } from "../lib/format-contribution-summary";
import { MergeContributionSummary } from "./merge-contribution-summary";
import {
  createContribution,
  fetchDuplicateSuggestions,
  fetchEntityContributions,
  fetchFieldProvenance,
  resolveContribution,
  voteContribution
} from "../api/contributions-api";
import type { Contribution, ContributionListResponse, ContributionType } from "../types/contributions";
import styles from "./entity-contributions-section.module.css";
import { FieldProvenanceBadge } from "./field-provenance-badge";
import { SuggestCorrectionModal } from "./suggest-correction-modal";
import { SuggestMergeModal } from "./suggest-merge-modal";

interface EntityContributionsSectionProps {
  accessToken: string | undefined;
  canInteract: boolean;
  currentUserId: string | undefined;
  isAdmin: boolean;
  entity: {
    canonicalUrl: string | null;
    description: string | null;
    id: string;
    logoUrl: string | null;
    title: string;
    type: string;
  };
}

interface CorrectionField {
  contributionType: ContributionType;
  currentValue: string;
  fieldKey: string;
  inputType?: "select" | "text" | "url" | "textarea";
  labelKey:
    | "contributions.field.title"
    | "contributions.field.description"
    | "contributions.field.canonicalUrl"
    | "contributions.field.logoUrl"
    | "contributions.field.type";
}

export function EntityContributionsSection({
  accessToken,
  canInteract,
  currentUserId,
  isAdmin,
  entity
}: EntityContributionsSectionProps) {
  const t = useTranslation();
  const queryClient = useQueryClient();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeField, setActiveField] = useState<CorrectionField | null>(null);
  const [draftValue, setDraftValue] = useState("");
  const [mergeModalOpen, setMergeModalOpen] = useState(false);

  const provenanceQuery = useQuery({
    queryFn: () => fetchFieldProvenance(entity.id),
    queryKey: ["entity-provenance", entity.id]
  });

  const contributionsQuery = useQuery({
    queryFn: () => fetchEntityContributions(entity.id),
    queryKey: ["entity-contributions", entity.id]
  });

  const duplicatesQuery = useQuery({
    queryFn: () => fetchDuplicateSuggestions(entity.id),
    queryKey: ["entity-duplicate-suggestions", entity.id]
  });

  const entityTypeOptions = useMemo(
    () =>
      ENTITY_TYPES.map((value) => ({
        label: formatEntityTypeLabel(t, value),
        value
      })).sort((left, right) => left.label.localeCompare(right.label)),
    [t]
  );

  const fields = useMemo<CorrectionField[]>(
    () => [
      {
        contributionType: "UPDATE_NAME",
        currentValue: entity.title,
        fieldKey: "title",
        labelKey: "contributions.field.title"
      },
      {
        contributionType: "UPDATE_URL",
        currentValue: entity.canonicalUrl ?? "",
        fieldKey: "canonicalUrl",
        inputType: "url",
        labelKey: "contributions.field.canonicalUrl"
      },
      {
        contributionType: "UPDATE_DESCRIPTION",
        currentValue: entity.description ?? "",
        fieldKey: "description",
        inputType: "textarea",
        labelKey: "contributions.field.description"
      },
      {
        contributionType: "UPDATE_TYPE",
        currentValue: entity.type,
        fieldKey: "type",
        inputType: "select",
        labelKey: "contributions.field.type"
      },
      {
        contributionType: "UPDATE_LOGO",
        currentValue: entity.logoUrl ?? "",
        fieldKey: "logoUrl",
        inputType: "url",
        labelKey: "contributions.field.logoUrl"
      }
    ],
    [entity]
  );

  const provenanceByField = useMemo(() => {
    const map = new Map<string, { source: string; votersCount: number }>();

    for (const item of provenanceQuery.data?.items ?? []) {
      map.set(item.field, { source: item.source, votersCount: item.votersCount });
    }

    return map;
  }, [provenanceQuery.data?.items]);

  const createMutation = useMutation({
    mutationFn: (input: { payload: Record<string, unknown>; type: ContributionType }) => {
      if (!accessToken) {
        throw new Error("Missing auth token");
      }

      return createContribution(entity.id, input, accessToken);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) {
        setErrorMessage(t("contributions.signInRequired"));
        return;
      }

      setErrorMessage(
        (error instanceof ApiError ? readApiErrorMessage(error.body) : null) ??
          t("contributions.submitFailed")
      );
    },
    onSuccess: (contribution) => {
      setStatusMessage(t("contributions.submitSuccess"));
      setErrorMessage(null);
      setActiveField(null);
      setDraftValue("");
      queryClient.setQueryData<ContributionListResponse>(
        ["entity-contributions", entity.id],
        (current) => {
          const existing = current?.items ?? [];
          const withoutDuplicate = existing.filter((item) => item.id !== contribution.id);

          return { items: [contribution, ...withoutDuplicate] };
        }
      );
    }
  });

  const voteMutation = useMutation({
    mutationFn: (input: { contributionId: string; kind: "APPROVE" | "REJECT" }) => {
      if (!accessToken) {
        throw new Error("Missing auth token");
      }

      return voteContribution(input.contributionId, input.kind, accessToken);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) {
        setErrorMessage(t("contributions.signInRequired"));
        return;
      }

      const apiMessage = error instanceof ApiError ? readApiErrorMessage(error.body) : null;

      if (apiMessage === "Authors cannot vote on their own contributions") {
        setErrorMessage(t("contributions.cannotVoteOwn"));
        return;
      }

      setErrorMessage(apiMessage ?? t("contributions.voteFailed"));
    },
    onSuccess: (contribution) => {
      setErrorMessage(null);

      if (contribution.status === "PENDING") {
        queryClient.setQueryData<ContributionListResponse>(
          ["entity-contributions", entity.id],
          (current) => {
            const existing = current?.items ?? [];

            return {
              items: existing.map((item) =>
                item.id === contribution.id ? contribution : item
              )
            };
          }
        );
        setStatusMessage(t("contributions.voteSuccess"));
        return;
      }

      queryClient.setQueryData<ContributionListResponse>(
        ["entity-contributions", entity.id],
        (current) => ({
          items: (current?.items ?? []).filter((item) => item.id !== contribution.id)
        })
      );

      if (contribution.status === "REJECTED") {
        setStatusMessage(t("contributions.rejectedSuccess"));
        return;
      }

      if (contribution.status === "APPLIED") {
        setStatusMessage(t("contributions.appliedSuccess"));
        void Promise.all([
          queryClient.invalidateQueries({ queryKey: ["entity-provenance", entity.id] }),
          queryClient.invalidateQueries({ queryKey: ["entity-page", entity.id] })
        ]);
      }
    }
  });

  const resolveMutation = useMutation({
    mutationFn: (input: { action: "apply" | "reject"; contributionId: string }) => {
      if (!accessToken) {
        throw new Error("Missing auth token");
      }

      return resolveContribution(input.contributionId, input.action, accessToken);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) {
        setErrorMessage(t("contributions.signInRequired"));
        return;
      }

      if (error instanceof ApiError && error.status === 403) {
        setErrorMessage(t("contributions.adminResolveFailed"));
        return;
      }

      setErrorMessage(
        (error instanceof ApiError ? readApiErrorMessage(error.body) : null) ??
          t("contributions.adminResolveFailed")
      );
    },
    onSuccess: (contribution) => {
      setErrorMessage(null);

      queryClient.setQueryData<ContributionListResponse>(
        ["entity-contributions", entity.id],
        (current) => ({
          items: (current?.items ?? []).filter((item) => item.id !== contribution.id)
        })
      );

      if (contribution.status === "REJECTED") {
        setStatusMessage(t("contributions.rejectedSuccess"));
        return;
      }

      if (contribution.status === "APPLIED") {
        setStatusMessage(t("contributions.appliedSuccess"));
        const mergeTargetId =
          contribution.type === "MERGE_ENTITY"
            ? ((contribution.payload as { targetEntityId?: string }).targetEntityId ?? null)
            : null;

        void Promise.all([
          queryClient.invalidateQueries({ queryKey: ["entity-provenance", entity.id] }),
          queryClient.invalidateQueries({ queryKey: ["entity-page", entity.id] }),
          queryClient.invalidateQueries({ queryKey: ["entity-tops", entity.id] }),
          queryClient.invalidateQueries({ queryKey: ["entity-duplicate-suggestions", entity.id] }),
          ...(mergeTargetId
            ? [
                queryClient.invalidateQueries({ queryKey: ["entity-page", mergeTargetId] }),
                queryClient.invalidateQueries({ queryKey: ["entity-tops", mergeTargetId] }),
                queryClient.invalidateQueries({
                  queryKey: ["entity-duplicate-suggestions", mergeTargetId]
                })
              ]
            : [])
        ]);
      }
    }
  });

  function openCorrectionModal(field: CorrectionField): void {
    if (!canInteract) {
      setErrorMessage(t("contributions.signInRequired"));
      return;
    }

    setActiveField(field);
    setDraftValue(field.currentValue);
    setStatusMessage(null);
    setErrorMessage(null);
  }

  function handleSubmitCorrection(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (!activeField) {
      return;
    }

    const trimmed = draftValue.trim();

    if (!trimmed) {
      return;
    }

    createMutation.mutate({
      payload: {
        newValue: trimmed,
        oldValue: resolveFieldOldValue(activeField, entity)
      },
      type: activeField.contributionType
    });
  }

  function handleSuggestMerge(targetEntityId: string, onSuccess?: () => void): void {
    if (!canInteract || !accessToken) {
      setErrorMessage(t("contributions.signInRequired"));
      return;
    }

    createMutation.mutate(
      {
        payload: {
          reason: t("contributions.mergeReason"),
          sourceEntityId: entity.id,
          targetEntityId
        },
        type: "MERGE_ENTITY"
      },
      {
        onSuccess: () => {
          setStatusMessage(t("contributions.mergeSuccess"));
          onSuccess?.();
        }
      }
    );
  }

  function renderFieldValue(field: CorrectionField): string {
    if (field.fieldKey === "type") {
      return formatEntityTypeLabel(t, entity.type);
    }

    if (field.fieldKey === "canonicalUrl") {
      return entity.canonicalUrl ?? "—";
    }

    if (field.fieldKey === "description") {
      return entity.description?.trim() || "—";
    }

    if (field.fieldKey === "logoUrl") {
      return entity.logoUrl ?? "—";
    }

    return entity.title;
  }

  function renderLogoPreview(url: string | null): ReactNode {
    if (!url?.trim()) {
      return <p className={styles.fieldValue}>—</p>;
    }

    return (
      <div className={styles.logoPreview}>
        <img alt="" className={styles.logoImage} src={url} />
        <p className={`${styles.fieldValue} ${styles.logoUrl}`}>{url}</p>
      </div>
    );
  }

  return (
    <section
      className={`panel-card entity-section ${styles.entityContributionsSection}`}
      aria-labelledby="entity-contributions-heading"
    >
      <div className="section-heading">
        <p className="result-type">{t("contributions.sectionEyebrow")}</p>
        <h2 id="entity-contributions-heading">{t("contributions.sectionTitle")}</h2>
      </div>

      {fields.map((field) => {
        const provenance = provenanceByField.get(field.fieldKey);

        return (
          <div className={styles.fieldRow} key={field.fieldKey}>
            <span className={styles.fieldLabel}>{t(field.labelKey)}</span>
            <div className={styles.fieldBody}>
              <div className={styles.fieldMain}>
                {field.fieldKey === "logoUrl" ? (
                  renderLogoPreview(entity.logoUrl)
                ) : (
                  <p className={styles.fieldValue}>{renderFieldValue(field)}</p>
                )}
                {provenance?.source === "community" ? (
                  <FieldProvenanceBadge
                    label={t("contributions.provenance.communityShort")}
                    votersCount={provenance.votersCount}
                  />
                ) : null}
              </div>
              <button
                type="button"
                className={`secondary-button ${styles.suggestButton}`}
                disabled={!canInteract || createMutation.isPending}
                onClick={() => {
                  openCorrectionModal(field);
                }}
              >
                {t("contributions.suggestCorrection")}
              </button>
            </div>
          </div>
        );
      })}

      <div>
        <h3 className="result-type">{t("contributions.pendingTitle")}</h3>
        {(contributionsQuery.data?.items.length ?? 0) > 0 ? (
          <div className={styles.pendingList}>
            {contributionsQuery.data?.items.map((contribution) => (
              <PendingContributionCard
                canInteract={canInteract}
                contribution={contribution}
                currentEntity={entity}
                currentUserId={currentUserId}
                isAdmin={isAdmin}
                isResolving={resolveMutation.isPending}
                isVoting={voteMutation.isPending}
                key={contribution.id}
                onResolve={(action) => {
                  resolveMutation.mutate({ action, contributionId: contribution.id });
                }}
                onVote={(kind) => {
                  voteMutation.mutate({ contributionId: contribution.id, kind });
                }}
              />
            ))}
          </div>
        ) : (
          <p className="muted-copy">{t("contributions.pendingEmpty")}</p>
        )}
      </div>

      {(duplicatesQuery.data?.items.length ?? 0) > 0 ? (
        <div>
          <h3 className="result-type">{t("contributions.duplicatesTitle")}</h3>
          <div className={styles.duplicateList}>
            {duplicatesQuery.data?.items.map((item) => (
              <div className={styles.duplicateCard} key={item.entity.id}>
                <div>
                  <Link href={`/entities/${item.entity.id}`}>{item.entity.title}</Link>
                  <p className="muted-copy">
                    {t("contributions.duplicatesHint", { percent: item.matchPercent })}
                  </p>
                </div>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={!canInteract || createMutation.isPending}
                  onClick={() => {
                    handleSuggestMerge(item.entity.id);
                  }}
                >
                  {t("contributions.suggestMerge")}
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <h3 className="result-type">{t("contributions.manualMergeTitle")}</h3>
        <p className="muted-copy">{t("contributions.manualMergeHint")}</p>
        <button
          type="button"
          className="secondary-button"
          disabled={!canInteract || createMutation.isPending}
          onClick={() => {
            setMergeModalOpen(true);
          }}
        >
          {t("contributions.manualMergeCta")}
        </button>
      </div>

      <FormFeedback errorMessage={errorMessage} statusMessage={statusMessage} />

      {activeField ? (
        <SuggestCorrectionModal
          fieldLabel={t(activeField.labelKey)}
          isSubmitting={createMutation.isPending}
          submitDisabled={
            !draftValue.trim() ||
            (activeField.fieldKey === "type" && draftValue === activeField.currentValue)
          }
          title={t("contributions.modalTitle")}
          onClose={() => {
            setActiveField(null);
          }}
          onSubmit={handleSubmitCorrection}
        >
          <label className="field-label">
            {t("contributions.newValueLabel")}
            {activeField.inputType === "textarea" ? (
              <textarea
                autoFocus
                rows={4}
                value={draftValue}
                onChange={(event) => {
                  setDraftValue(event.target.value);
                }}
              />
            ) : activeField.inputType === "select" ? (
              <select
                autoFocus
                value={draftValue}
                onChange={(event) => {
                  setDraftValue(event.target.value);
                }}
              >
                {entityTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                autoFocus
                type={activeField.inputType === "url" ? "url" : "text"}
                value={draftValue}
                onChange={(event) => {
                  setDraftValue(event.target.value);
                }}
              />
            )}
          </label>
        </SuggestCorrectionModal>
      ) : null}

      {mergeModalOpen ? (
        <SuggestMergeModal
          currentEntityId={entity.id}
          isSubmitting={createMutation.isPending}
          onClose={() => {
            setMergeModalOpen(false);
          }}
          onSubmit={(targetEntityId) => {
            handleSuggestMerge(targetEntityId, () => {
              setMergeModalOpen(false);
            });
          }}
        />
      ) : null}
    </section>
  );
}

function resolveFieldOldValue(
  field: CorrectionField,
  entity: EntityContributionsSectionProps["entity"]
): string | null {
  switch (field.fieldKey) {
    case "title":
      return entity.title;
    case "canonicalUrl":
      return entity.canonicalUrl;
    case "description":
      return entity.description;
    case "logoUrl":
      return entity.logoUrl;
    case "type":
      return entity.type;
    default:
      return null;
  }
}

function formatVoteAmount(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatSignedVoteScore(net: number, required: number): string {
  const requiredLabel = formatVoteAmount(required);

  if (net === 0) {
    return `0/${requiredLabel}`;
  }

  if (net > 0) {
    return `${formatVoteAmount(net)}/${requiredLabel}`;
  }

  return `-${formatVoteAmount(Math.abs(net))}/${requiredLabel}`;
}

function resolveCardTone(net: number): "negative" | "neutral" | "positive" {
  if (net > 0) {
    return "positive";
  }

  if (net < 0) {
    return "negative";
  }

  return "neutral";
}

const CARD_TONE_CLASS: Record<ReturnType<typeof resolveCardTone>, string> = {
  negative: "is-negative",
  neutral: "",
  positive: "is-positive"
};

const VOTE_SCORE_CLASS: Record<ReturnType<typeof resolveCardTone>, string> = {
  negative: "is-negative",
  neutral: "",
  positive: "is-positive"
};

function PendingContributionCard({
  canInteract,
  contribution,
  currentEntity,
  currentUserId,
  isAdmin,
  isResolving,
  isVoting,
  onResolve,
  onVote
}: {
  canInteract: boolean;
  contribution: Contribution;
  currentEntity: EntityContributionsSectionProps["entity"];
  currentUserId: string | undefined;
  isAdmin: boolean;
  isResolving: boolean;
  isVoting: boolean;
  onResolve: (action: "apply" | "reject") => void;
  onVote: (kind: "APPROVE" | "REJECT") => void;
}) {
  const t = useTranslation();
  const summary =
    contribution.type === "MERGE_ENTITY" ? null : formatContributionSummary(t, contribution);
  const requiredApprovals = contribution.requiredApprovalsWeight ?? 0;
  const isOwnContribution = Boolean(currentUserId && contribution.authorId === currentUserId);
  const canVote = canInteract && !isOwnContribution && contribution.tier !== "MODERATION";
  const canModerate = isAdmin && contribution.tier === "MODERATION";
  const voteNet = contribution.approvalsWeight - contribution.rejectionsWeight;
  const cardTone = resolveCardTone(voteNet);
  const voteScoreLabel =
    contribution.tier === "MODERATION"
      ? t("contributions.moderationBadge")
      : formatSignedVoteScore(voteNet, requiredApprovals);

  return (
    <article className={`contribution-pending-card ${CARD_TONE_CLASS[cardTone]}`.trim()}>
      <div className="contribution-pending-header">
        <p className="contribution-pending-type">{formatContributionTypeLabel(t, contribution.type)}</p>
        <span className={`contribution-vote-score ${VOTE_SCORE_CLASS[cardTone]}`.trim()}>
          {voteScoreLabel}
        </span>
      </div>
      {summary ? (
        <p className="contribution-pending-value">{summary}</p>
      ) : (
        <MergeContributionSummary currentEntity={currentEntity} payload={contribution.payload} />
      )}
      {contribution.tier === "MODERATION" && !canModerate ? (
        <p className="contribution-pending-note">{t("contributions.awaitingAdmin")}</p>
      ) : null}
      {canModerate ? (
        <div className="contribution-pending-actions">
          <button
            type="button"
            className="contribution-vote-button is-approve"
            disabled={isResolving}
            onClick={() => {
              onResolve("apply");
            }}
          >
            {t("contributions.adminApply")}
          </button>
          <button
            type="button"
            className="contribution-vote-button is-reject"
            disabled={isResolving}
            onClick={() => {
              onResolve("reject");
            }}
          >
            {t("contributions.adminReject")}
          </button>
        </div>
      ) : contribution.tier !== "MODERATION" ? (
        <div className="contribution-pending-actions">
          <button
            type="button"
            className="contribution-vote-button is-approve"
            disabled={!canVote || isVoting}
            onClick={() => {
              onVote("APPROVE");
            }}
          >
            {t("contributions.approve")}
          </button>
          <button
            type="button"
            className="contribution-vote-button is-reject"
            disabled={!canVote || isVoting}
            onClick={() => {
              onVote("REJECT");
            }}
          >
            {t("contributions.reject")}
          </button>
        </div>
      ) : null}
      {isOwnContribution && contribution.tier !== "MODERATION" ? (
        <p className="contribution-pending-note">{t("contributions.cannotVoteOwn")}</p>
      ) : null}
    </article>
  );
}

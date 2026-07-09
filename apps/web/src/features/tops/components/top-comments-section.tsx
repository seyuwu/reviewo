"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";

import { FormFeedback } from "../../../components/form-feedback";
import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { useLocale, useTranslation } from "../../i18n/locale-provider";
import { createTopComment, fetchTopComments } from "../api/tops-api";

interface TopCommentsSectionProps {
  onCommentCreated?: () => void;
  topId: string;
}

export function TopCommentsSection({ onCommentCreated, topId }: TopCommentsSectionProps) {
  const t = useTranslation();
  const { resolvedLocale } = useLocale();
  const queryClient = useQueryClient();
  const { authSession } = useAuthSession();
  const [commentText, setCommentText] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const commentsQuery = useQuery({
    queryFn: () => fetchTopComments(topId, 20, undefined, authSession?.accessToken),
    queryKey: ["top-comments", topId, authSession?.accessToken ?? "anonymous"]
  });

  const commentMutation = useMutation({
    mutationFn: (text: string) => {
      if (!authSession?.accessToken) {
        throw new Error("auth required");
      }

      return createTopComment(topId, text, authSession.accessToken);
    },
    onSuccess: async () => {
      setCommentText("");
      setErrorMessage(null);
      await queryClient.invalidateQueries({ queryKey: ["top-comments", topId] });
      onCommentCreated?.();
    },
    onError: () => {
      setErrorMessage(t("web.userTops.commentFailed"));
    }
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!authSession?.accessToken) {
      setErrorMessage(t("web.userTops.signInToComment"));
      return;
    }

    const trimmed = commentText.trim();

    if (!trimmed) {
      return;
    }

    commentMutation.mutate(trimmed);
  }

  return (
    <section className="panel-card" id="top-comments">
      <header className="panel-header">
        <h2>{t("web.userTops.commentsTitle")}</h2>
      </header>

      {authSession?.accessToken ? (
        <form className="creation-form" onSubmit={(event) => void handleSubmit(event)}>
          <label className="field-label">
            {t("web.userTops.commentLabel")}
            <textarea
              maxLength={2000}
              placeholder={t("web.userTops.commentPlaceholder")}
              rows={4}
              value={commentText}
              disabled={commentMutation.isPending}
              onChange={(event) => {
                setCommentText(event.target.value);
              }}
            />
          </label>
          <button
            type="submit"
            className="primary-button primary-button-stable-label"
            disabled={!commentText.trim() || commentMutation.isPending}
          >
            {commentMutation.isPending ? t("web.userTops.commentSubmitting") : t("web.userTops.commentSubmit")}
          </button>
          <FormFeedback errorMessage={errorMessage} />
        </form>
      ) : (
        <p className="muted-copy">{t("web.userTops.signInToComment")}</p>
      )}

      {commentsQuery.isLoading ? (
        <p className="muted-copy">{t("web.userTops.commentsLoading")}</p>
      ) : commentsQuery.data?.items.length ? (
        <div className="review-list">
          {commentsQuery.data.items.map((comment) => (
            <article
              className={`review-card${comment.isOwnComment ? " is-own-review" : ""}`}
              key={comment.id}
            >
              <p>{comment.text}</p>
              <div className="review-card-footer">
                <div className="review-meta">
                  <strong>{comment.author.displayName}</strong>
                  <span>{formatCommentDate(comment.createdAt, resolvedLocale)}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="muted-copy">{t("web.userTops.commentsEmpty")}</p>
      )}
    </section>
  );
}

function formatCommentDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

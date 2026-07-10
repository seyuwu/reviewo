"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { ApiError } from "../../../lib/api/api-error";
import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { useTranslation } from "../../i18n/locale-provider";
import { endorseSpotlightPlacement, unendorseSpotlightPlacement } from "../api/spotlight-api";
import type { SpotlightPlacement } from "../types/spotlight";

interface SpotlightEndorseButtonProps {
  item: SpotlightPlacement;
}

export function SpotlightEndorseButton({ item }: SpotlightEndorseButtonProps) {
  const t = useTranslation();
  const queryClient = useQueryClient();
  const { authSession } = useAuthSession();
  const accessToken = authSession?.accessToken;
  const recommendation = item.recommendation;
  const endorsementsCount = recommendation?.endorsementsCount ?? 0;
  const viewerHasEndorsed = recommendation?.viewerHasEndorsed ?? false;
  const viewerCanEndorse = recommendation?.viewerCanEndorse ?? false;

  const mutation = useMutation({
    mutationFn: async () => {
      if (!accessToken) {
        throw new Error("auth_required");
      }

      if (viewerHasEndorsed) {
        return unendorseSpotlightPlacement(accessToken, item.placementId);
      }

      return endorseSpotlightPlacement(accessToken, item.placementId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["spotlight-feed"] });
    }
  });

  if (!accessToken || !viewerCanEndorse) {
    if (endorsementsCount > 0) {
      return (
        <p className="spotlight-card-endorsements muted-copy">
          {t("web.spotlight.endorsementsCount", { count: String(endorsementsCount) })}
        </p>
      );
    }

    return null;
  }

  const errorMessage =
    mutation.error instanceof ApiError && mutation.error.status === 403
      ? t("web.spotlight.endorseError.eligibility")
      : mutation.isError
        ? t("web.spotlight.endorseError.generic")
        : null;

  return (
    <div className="spotlight-card-endorse">
      <button
        aria-pressed={viewerHasEndorsed}
        className={viewerHasEndorsed ? "primary-button spotlight-endorse-button" : "secondary-button spotlight-endorse-button"}
        disabled={mutation.isPending}
        type="button"
        onClick={() => mutation.mutate()}
      >
        {viewerHasEndorsed
          ? t("web.spotlight.endorseActionActive")
          : t("web.spotlight.endorseAction")}
      </button>
      {endorsementsCount > 0 ? (
        <p className="spotlight-card-endorsements muted-copy">
          {t("web.spotlight.endorsementsCount", { count: String(endorsementsCount) })}
        </p>
      ) : null}
      {errorMessage ? <p className="error-message">{errorMessage}</p> : null}
    </div>
  );
}

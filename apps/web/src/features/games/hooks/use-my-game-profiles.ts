"use client";

import { useQuery } from "@tanstack/react-query";

import { ApiError } from "../../../lib/api/api-error";
import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { fetchMyDotaProfile } from "../../dota/api/dota-api";
import {
  buildLinkedGameProfilesFromDota,
  canShowEditGameProfileAction,
  getGameCreatePath,
  getGameEditPath,
  getGameProfilePath,
  listAddableGameVerticals
} from "../lib/game-profile-catalog";
import type { LinkedGameProfile } from "../types/game-profile";

/**
 * Normalizes the player's linked game profiles across verticals.
 * Today this resolves only Dota; adding other game APIs hooks in here later.
 */
export function useMyGameProfiles() {
  const { authSession, isAuthSessionLoaded } = useAuthSession();
  const accessToken = authSession?.accessToken;

  const dotaQuery = useQuery({
    enabled: Boolean(accessToken),
    queryFn: () => fetchMyDotaProfile(accessToken ?? ""),
    queryKey: ["game-profiles", "dota", "me", accessToken],
    retry: false
  });

  const dotaMissing =
    dotaQuery.isError && dotaQuery.error instanceof ApiError && dotaQuery.error.status === 404;

  const linkedProfiles: LinkedGameProfile[] = buildLinkedGameProfilesFromDota(
    dotaMissing || !dotaQuery.data
      ? null
      : {
          slug: dotaQuery.data.slug,
          title: dotaQuery.data.title
        }
  );

  const addableGames = listAddableGameVerticals(linkedProfiles);
  const isLoading =
    !isAuthSessionLoaded || (Boolean(accessToken) && dotaQuery.isLoading && !dotaMissing);

  return {
    addableGames,
    canAddAdditionalGames: addableGames.length > 0,
    canEditProfile: (gameId: LinkedGameProfile["gameId"]) => canShowEditGameProfileAction(gameId),
    getCreatePath: getGameCreatePath,
    getEditPath: getGameEditPath,
    getProfilePath: getGameProfilePath,
    isAuthenticated: Boolean(accessToken),
    isLoading,
    linkedProfiles
  };
}

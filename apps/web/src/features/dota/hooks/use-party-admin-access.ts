"use client";

import { useQuery } from "@tanstack/react-query";

import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { getCurrentUserProfile } from "../../profile/api/profile";

export function usePartyAdminAccess(enabled = true) {
  const { authSession, isAuthSessionLoaded } = useAuthSession();
  const accessToken = authSession?.accessToken;
  const profile = useQuery({
    enabled: enabled && Boolean(accessToken),
    queryFn: () => getCurrentUserProfile(accessToken ?? ""),
    queryKey: ["profile", "me", accessToken],
    retry: false,
    staleTime: 60_000
  });
  return {
    accessToken,
    isAdmin: Boolean(accessToken) && profile.data?.role === "ADMIN" && !profile.isError,
    isLoading: !isAuthSessionLoaded || (Boolean(accessToken) && profile.isPending)
  };
}

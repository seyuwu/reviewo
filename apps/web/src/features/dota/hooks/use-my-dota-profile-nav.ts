"use client";

import { useEffect, useState } from "react";

import { ApiError } from "../../../lib/api/api-error";
import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { fetchMyDotaProfile } from "../api/dota-api";

type LoadState = "idle" | "loading" | "loaded";

export function useMyDotaProfileNav() {
  const { authSession, isAuthSessionLoaded } = useAuthSession();
  const [slug, setSlug] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");

  useEffect(() => {
    if (!isAuthSessionLoaded) {
      return;
    }

    if (!authSession?.accessToken) {
      setSlug(null);
      setLoadState("loaded");
      return;
    }

    let isCancelled = false;
    setLoadState("loading");

    void fetchMyDotaProfile(authSession.accessToken)
      .then((profile) => {
        if (!isCancelled) {
          setSlug(profile.slug);
          setLoadState("loaded");
        }
      })
      .catch((error) => {
        if (isCancelled) {
          return;
        }

        if (error instanceof ApiError && error.status === 404) {
          setSlug(null);
        }

        setLoadState("loaded");
      });

    return () => {
      isCancelled = true;
    };
  }, [authSession?.accessToken, isAuthSessionLoaded]);

  return {
    hasProfile: slug !== null,
    href: slug ? `/dota/${slug}` : "/dota/create",
    isLoading: !isAuthSessionLoaded || loadState === "loading",
    slug
  };
}

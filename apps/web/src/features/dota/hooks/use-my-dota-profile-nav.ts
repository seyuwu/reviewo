"use client";

import { useEffect, useState } from "react";

import { ApiError } from "../../../lib/api/api-error";
import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { fetchMyDotaProfile } from "../api/dota-api";

type LoadState = "idle" | "loading" | "loaded" | "error";

export const DOTA_PROFILE_CREATED_EVENT = "dota:profile-created";
export const DOTA_PROFILE_CINEMATIC_ARRIVED_EVENT = "dota:profile-cinematic-arrived";

export interface DotaProfileCreatedEventDetail {
  cinematic?: boolean;
  slug: string;
}

export function useMyDotaProfileNav() {
  const { authSession, isAuthSessionLoaded } = useAuthSession();
  const [slug, setSlug] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [loadedAccessToken, setLoadedAccessToken] = useState<string | null>();

  useEffect(() => {
    if (!isAuthSessionLoaded) {
      return;
    }

    if (!authSession?.accessToken) {
      setSlug(null);
      setLoadState("loaded");
      setLoadedAccessToken(null);
      return;
    }

    let isCancelled = false;
    setSlug(null);
    setLoadState("loading");

    void fetchMyDotaProfile(authSession.accessToken)
      .then((profile) => {
        if (!isCancelled) {
          setSlug(profile.slug);
          setLoadState("loaded");
          setLoadedAccessToken(authSession.accessToken);
        }
      })
      .catch((error) => {
        if (isCancelled) {
          return;
        }

        if (error instanceof ApiError && error.status === 404) {
          setSlug(null);
          setLoadState("loaded");
        } else {
          setLoadState("error");
        }

        setLoadedAccessToken(authSession.accessToken);
      });

    return () => {
      isCancelled = true;
    };
  }, [authSession?.accessToken, isAuthSessionLoaded]);

  useEffect(() => {
    function handleProfileCreated(event: Event) {
      const detail = (event as CustomEvent<DotaProfileCreatedEventDetail>).detail;

      if (!detail?.slug) {
        return;
      }

      setSlug(detail.slug);
      setLoadState("loaded");
      setLoadedAccessToken(authSession?.accessToken ?? null);
    }

    window.addEventListener(DOTA_PROFILE_CREATED_EVENT, handleProfileCreated);

    return () => {
      window.removeEventListener(DOTA_PROFILE_CREATED_EVENT, handleProfileCreated);
    };
  }, [authSession?.accessToken]);

  const expectedAccessToken = authSession?.accessToken ?? null;
  return {
    hasProfile: slug !== null,
    href: slug ? `/dota/${slug}` : "/dota/create",
    isLoading:
      !isAuthSessionLoaded ||
      loadState !== "loaded" ||
      loadedAccessToken !== expectedAccessToken,
    slug
  };
}

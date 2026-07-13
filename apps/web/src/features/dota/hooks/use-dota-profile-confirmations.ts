"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  DOTA_FLAG_LIMIT_PER_SIDE,
  isDotaGreenFlagKey,
  isDotaRedFlagKey
} from "@reviewo/shared";

import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { useTranslation } from "../../i18n/locale-provider";
import { confirmDotaQualities, revokeDotaQuality } from "../api/dota-api";
import { trackDotaEvent } from "../lib/analytics";
import {
  getStoredConfirmedKeys,
  setStoredConfirmedKeys
} from "../lib/confirmed-qualities-storage";
import { resolveDotaConfirmError } from "../lib/resolve-dota-confirm-error";
import { getOrCreateDotaVisitorId } from "../lib/visitor-id";
import type { DotaProfile } from "../types/dota";

interface UseDotaProfileConfirmationsOptions {
  canConfirmOverride?: boolean;
}

export function useDotaProfileConfirmations(
  profile: DotaProfile,
  options: UseDotaProfileConfirmationsOptions = {}
) {
  const t = useTranslation();
  const router = useRouter();
  const { authSession } = useAuthSession();
  const [confirmedKeys, setConfirmedKeys] = useState<string[]>([]);
  const [pendingKeys, setPendingKeys] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const canConfirm = options.canConfirmOverride ?? !profile.isOwner;

  useEffect(() => {
    if (!canConfirm) {
      return;
    }

    setConfirmedKeys(getStoredConfirmedKeys(profile.slug));
  }, [canConfirm, profile.slug]);

  function updateConfirmedKeys(nextKeys: string[]) {
    setConfirmedKeys(nextKeys);
    setStoredConfirmedKeys(profile.slug, nextKeys);
  }

  function getLimitError(key: string): string | null {
    if (confirmedKeys.includes(key)) {
      return null;
    }

    if (isDotaGreenFlagKey(key)) {
      const greenCount = confirmedKeys.filter(isDotaGreenFlagKey).length;

      if (greenCount >= DOTA_FLAG_LIMIT_PER_SIDE) {
        return t("dota.flags.greenLimit", { limit: String(DOTA_FLAG_LIMIT_PER_SIDE) });
      }
    }

    if (isDotaRedFlagKey(key)) {
      const redCount = confirmedKeys.filter(isDotaRedFlagKey).length;

      if (redCount >= DOTA_FLAG_LIMIT_PER_SIDE) {
        return t("dota.flags.redLimit", { limit: String(DOTA_FLAG_LIMIT_PER_SIDE) });
      }
    }

    return null;
  }

  async function toggleKey(key: string) {
    if (!canConfirm || pendingKeys.includes(key)) {
      return;
    }

    const limitError = getLimitError(key);

    if (limitError) {
      setError(limitError);
      return;
    }

    const visitorId = getOrCreateDotaVisitorId();
    const isConfirmed = confirmedKeys.includes(key);

    setError(null);
    setPendingKeys((current) => [...current, key]);

    try {
      if (isConfirmed) {
        await revokeDotaQuality(profile.slug, [key], visitorId, authSession?.accessToken);
        updateConfirmedKeys(confirmedKeys.filter((value) => value !== key));
      } else {
        await confirmDotaQualities(profile.slug, [key], visitorId, authSession?.accessToken);
        updateConfirmedKeys([...new Set([...confirmedKeys, key])]);
        trackDotaEvent("dota_confirmation_submitted", { slug: profile.slug });
      }

      router.refresh();
    } catch (submitError) {
      setError(resolveDotaConfirmError(submitError, t));
    } finally {
      setPendingKeys((current) => current.filter((value) => value !== key));
    }
  }

  return {
    canConfirm,
    confirmedKeys,
    error,
    pendingKeys,
    setError,
    toggleKey
  };
}

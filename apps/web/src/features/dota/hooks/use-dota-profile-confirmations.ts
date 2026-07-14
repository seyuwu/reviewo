"use client";

import { useEffect, useRef, useState } from "react";

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
  onProfileUpdated?: (profile: DotaProfile) => void;
}

export function useDotaProfileConfirmations(
  profile: DotaProfile,
  options: UseDotaProfileConfirmationsOptions = {}
) {
  const t = useTranslation();
  const { authSession } = useAuthSession();
  const [confirmedKeys, setConfirmedKeys] = useState<string[]>([]);
  const [pendingKeys, setPendingKeys] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const confirmedKeysRef = useRef<string[]>([]);
  const pendingKeysRef = useRef<string[]>([]);
  const onProfileUpdatedRef = useRef(options.onProfileUpdated);

  const canConfirm = options.canConfirmOverride ?? !profile.isOwner;

  useEffect(() => {
    onProfileUpdatedRef.current = options.onProfileUpdated;
  }, [options.onProfileUpdated]);

  useEffect(() => {
    if (!canConfirm) {
      return;
    }

    const storedKeys = getStoredConfirmedKeys(profile.slug);
    confirmedKeysRef.current = storedKeys;
    setConfirmedKeys(storedKeys);
  }, [canConfirm, profile.slug]);

  function updateConfirmedKeys(nextKeys: string[]) {
    confirmedKeysRef.current = nextKeys;
    setConfirmedKeys(nextKeys);
    setStoredConfirmedKeys(profile.slug, nextKeys);
  }

  function getLimitError(key: string, currentKeys: string[]): string | null {
    if (currentKeys.includes(key)) {
      return null;
    }

    if (isDotaGreenFlagKey(key)) {
      const greenCount = currentKeys.filter(isDotaGreenFlagKey).length;

      if (greenCount >= DOTA_FLAG_LIMIT_PER_SIDE) {
        return t("dota.flags.greenLimit", { limit: String(DOTA_FLAG_LIMIT_PER_SIDE) });
      }
    }

    if (isDotaRedFlagKey(key)) {
      const redCount = currentKeys.filter(isDotaRedFlagKey).length;

      if (redCount >= DOTA_FLAG_LIMIT_PER_SIDE) {
        return t("dota.flags.redLimit", { limit: String(DOTA_FLAG_LIMIT_PER_SIDE) });
      }
    }

    return null;
  }

  async function toggleKey(key: string) {
    if (!canConfirm || pendingKeysRef.current.includes(key)) {
      return;
    }

    const currentKeys = confirmedKeysRef.current;
    const limitError = getLimitError(key, currentKeys);

    if (limitError) {
      setError(limitError);
      return;
    }

    const visitorId = getOrCreateDotaVisitorId();
    const isConfirmed = currentKeys.includes(key);
    const nextPending = [...pendingKeysRef.current, key];

    setError(null);
    pendingKeysRef.current = nextPending;
    setPendingKeys(nextPending);

    try {
      const nextProfile = isConfirmed
        ? await revokeDotaQuality(profile.slug, [key], visitorId, authSession?.accessToken)
        : await confirmDotaQualities(profile.slug, [key], visitorId, authSession?.accessToken);

      const latestKeys = confirmedKeysRef.current;
      const nextKeys = isConfirmed
        ? latestKeys.filter((value) => value !== key)
        : [...new Set([...latestKeys, key])];

      updateConfirmedKeys(nextKeys);

      if (!isConfirmed) {
        trackDotaEvent("dota_confirmation_submitted", { slug: profile.slug });
      }

      onProfileUpdatedRef.current?.(nextProfile);
    } catch (submitError) {
      setError(resolveDotaConfirmError(submitError, t));
    } finally {
      const clearedPending = pendingKeysRef.current.filter((value) => value !== key);
      pendingKeysRef.current = clearedPending;
      setPendingKeys(clearedPending);
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

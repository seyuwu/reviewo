"use client";

import { DOTA_GREEN_FLAG_KEYS, DOTA_RED_FLAG_KEYS } from "@reviewo/shared";

import type { DotaProfile } from "../types/dota";
import { DotaProfileFlagPanel } from "./dota-profile-flag-panel";
import styles from "./dota-profile-flags.module.css";

interface DotaProfileFlagsProps {
  confirmations: ReturnType<typeof useDotaProfileConfirmations>;
  profile: DotaProfile;
}

export function DotaProfileFlags({ confirmations, profile }: DotaProfileFlagsProps) {
  return (
    <div className={styles.grid}>
      <DotaProfileFlagPanel
        confirmations={confirmations}
        flagKeys={DOTA_GREEN_FLAG_KEYS}
        polarity="green"
        profile={profile}
      />
      <DotaProfileFlagPanel
        confirmations={confirmations}
        flagKeys={DOTA_RED_FLAG_KEYS}
        polarity="red"
        profile={profile}
      />
    </div>
  );
}

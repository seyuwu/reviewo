const RECOVERY_STORAGE_KEY = "opinia.dota.recovery";

export interface StoredDotaRecovery {
  recoveryToken: string;
  recoveryUrl: string;
  slug: string;
}

export function stashDotaRecovery(value: StoredDotaRecovery): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(RECOVERY_STORAGE_KEY, JSON.stringify(value));
}

export function peekDotaRecovery(slug?: string): StoredDotaRecovery | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.sessionStorage.getItem(RECOVERY_STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as StoredDotaRecovery;

    if (
      typeof parsed.recoveryToken !== "string" ||
      typeof parsed.recoveryUrl !== "string" ||
      typeof parsed.slug !== "string"
    ) {
      window.sessionStorage.removeItem(RECOVERY_STORAGE_KEY);
      return null;
    }

    if (slug && parsed.slug !== slug) {
      return null;
    }

    return parsed;
  } catch {
    window.sessionStorage.removeItem(RECOVERY_STORAGE_KEY);
    return null;
  }
}

export function clearDotaRecovery(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(RECOVERY_STORAGE_KEY);
}

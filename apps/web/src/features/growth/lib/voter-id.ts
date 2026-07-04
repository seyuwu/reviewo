const VOTER_STORAGE_KEY = "opinia_voter";

export function getOrCreateVoterId(): string {
  if (typeof window === "undefined") {
    return "server";
  }

  const existing = window.localStorage.getItem(VOTER_STORAGE_KEY)?.trim();

  if (existing) {
    return existing;
  }

  const created = crypto.randomUUID();
  window.localStorage.setItem(VOTER_STORAGE_KEY, created);

  return created;
}

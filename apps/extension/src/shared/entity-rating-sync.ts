export const ENTITY_RATINGS_STORAGE_KEY = "reviewo.entityRatings";

export interface PersistedEntityRating {
  avgScore?: number;
  canonicalUrl: string;
  entityId: string;
  score: number;
  updatedAt: string;
  votesCount?: number;
}

export type PersistedEntityRatingsMap = Record<string, PersistedEntityRating>;

export async function persistEntityRating(entry: PersistedEntityRating): Promise<void> {
  const current = await readAllPersistedEntityRatings();

  current[entry.entityId] = entry;
  await chrome.storage.local.set({
    [ENTITY_RATINGS_STORAGE_KEY]: current
  });
}

export async function readPersistedEntityRatingEntry(
  entityId: string
): Promise<PersistedEntityRating | null> {
  const all = await readAllPersistedEntityRatings();

  return all[entityId] ?? null;
}

export async function readPersistedEntityRating(entityId: string): Promise<number | null> {
  const all = await readAllPersistedEntityRatings();
  const rating = all[entityId];

  return typeof rating?.score === "number" ? rating.score : null;
}

export async function readPersistedEntityRatingByCanonical(
  canonicalUrl: string
): Promise<PersistedEntityRating | null> {
  const normalizedCanonicalUrl = canonicalUrl.trim().toLowerCase();
  const all = await readAllPersistedEntityRatings();

  return (
    Object.values(all).find(
      (rating) => rating.canonicalUrl.trim().toLowerCase() === normalizedCanonicalUrl
    ) ?? null
  );
}

export async function readAllPersistedEntityRatings(): Promise<PersistedEntityRatingsMap> {
  const storageResult = await chrome.storage.local.get(ENTITY_RATINGS_STORAGE_KEY);
  const storedRatings = storageResult[ENTITY_RATINGS_STORAGE_KEY];

  if (!storedRatings || typeof storedRatings !== "object") {
    return {};
  }

  const ratings: PersistedEntityRatingsMap = {};

  for (const [entityId, value] of Object.entries(storedRatings)) {
    if (!value || typeof value !== "object") {
      continue;
    }

    const candidate = value as Partial<PersistedEntityRating>;

    if (
      typeof candidate.entityId === "string" &&
      typeof candidate.canonicalUrl === "string" &&
      typeof candidate.score === "number"
    ) {
      ratings[entityId] = {
        ...(typeof candidate.avgScore === "number" ? { avgScore: candidate.avgScore } : {}),
        canonicalUrl: candidate.canonicalUrl,
        entityId: candidate.entityId,
        score: candidate.score,
        updatedAt:
          typeof candidate.updatedAt === "string"
            ? candidate.updatedAt
            : new Date().toISOString(),
        ...(typeof candidate.votesCount === "number" ? { votesCount: candidate.votesCount } : {})
      };
    }
  }

  return ratings;
}

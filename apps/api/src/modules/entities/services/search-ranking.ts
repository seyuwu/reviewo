import type { UrlNormalizer } from "../interfaces/url-normalizer.js";

export type SearchResultKind = "canonical_site" | "entity";

export interface SearchEntityMetrics {
  avgScore: number | null;
  reviewsCount: number;
  votesCount: number;
}

export interface SearchRankableEntity {
  canonicalUrl: string | null;
  id: string;
  parentId: string | null;
  title: string;
}

export interface RankedSearchEntity extends SearchRankableEntity {
  avgScore: number | null;
  resultKind: SearchResultKind;
  reviewsCount: number;
  votesCount: number;
}

const MATCH_SCORE_DOMAIN = 4;
const MATCH_SCORE_EXACT_TITLE = 3;
const MATCH_SCORE_CHILD = 2;
const MATCH_SCORE_PARTIAL = 1;

export function rankSearchResults(
  entities: SearchRankableEntity[],
  query: string,
  metricsByEntityId: Map<string, SearchEntityMetrics>,
  urlNormalizer: UrlNormalizer,
  lookupByCanonicalUrl: (canonicalUrl: string) => SearchRankableEntity | null
): RankedSearchEntity[] {
  const canonicalRoot = resolveCanonicalRootEntity(
    entities,
    query,
    urlNormalizer,
    lookupByCanonicalUrl
  );
  const canonicalRootId = canonicalRoot?.id ?? null;

  const mergedEntities = canonicalRoot
    ? entities.some((entity) => entity.id === canonicalRoot.id)
      ? entities
      : [canonicalRoot, ...entities]
    : entities;

  const ranked = mergedEntities
    .map((entity) => {
      const metrics = metricsByEntityId.get(entity.id) ?? createEmptyMetrics();
      const matchScore = getMatchScore(entity, query, canonicalRootId, urlNormalizer);
      const isSiteRoot = isSiteRootEntity(entity, urlNormalizer);
      const score = computeRankingScore(matchScore, isSiteRoot, metrics);

      return {
        entity,
        metrics,
        score
      };
    })
    .sort((left, right) => right.score - left.score);

  return ranked.map(({ entity, metrics }) => ({
    ...entity,
    avgScore: metrics.avgScore,
    resultKind:
      canonicalRootId !== null && entity.id === canonicalRootId ? "canonical_site" : "entity",
    reviewsCount: metrics.reviewsCount,
    votesCount: metrics.votesCount
  }));
}

export function resolveCanonicalRootEntity(
  entities: SearchRankableEntity[],
  query: string,
  urlNormalizer: UrlNormalizer,
  lookupByCanonicalUrl: (canonicalUrl: string) => SearchRankableEntity | null
): SearchRankableEntity | null {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    return null;
  }

  const normalizedUrl = urlNormalizer.normalize(normalizedQuery);

  if (normalizedUrl) {
    const siteRootUrl = urlNormalizer.getSiteRootCanonicalUrl(normalizedUrl);
    const fromLookup = lookupByCanonicalUrl(siteRootUrl);

    if (fromLookup) {
      return fromLookup;
    }

    const fromResults = entities.find((entity) => entity.canonicalUrl === siteRootUrl);

    if (fromResults) {
      return fromResults;
    }
  }

  for (const candidate of buildDomainCandidates(normalizedQuery)) {
    const candidateUrl = urlNormalizer.normalize(candidate);

    if (!candidateUrl) {
      continue;
    }

    const siteRootUrl = urlNormalizer.getSiteRootCanonicalUrl(candidateUrl);
    const fromLookup = lookupByCanonicalUrl(siteRootUrl);

    if (fromLookup) {
      return fromLookup;
    }
  }

  for (const entity of entities) {
    if (!entity.canonicalUrl || !isSiteRootEntity(entity, urlNormalizer)) {
      continue;
    }

    try {
      const hostname = new URL(entity.canonicalUrl).hostname;

      if (hostnameMatchesQuery(hostname, normalizedQuery)) {
        return entity;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function getMatchScore(
  entity: SearchRankableEntity,
  query: string,
  canonicalRootId: string | null,
  urlNormalizer: UrlNormalizer
): number {
  const normalizedQuery = query.trim();

  if (entity.canonicalUrl && isSiteRootEntity(entity, urlNormalizer)) {
    try {
      const hostname = new URL(entity.canonicalUrl).hostname;

      if (hostnameMatchesQuery(hostname, normalizedQuery)) {
        return MATCH_SCORE_DOMAIN;
      }
    } catch {
      // Ignore invalid canonical URLs.
    }
  }

  const normalizedUrl = urlNormalizer.normalize(normalizedQuery);

  if (normalizedUrl && entity.canonicalUrl) {
    const siteRootUrl = urlNormalizer.getSiteRootCanonicalUrl(normalizedUrl);

    if (entity.canonicalUrl === siteRootUrl || entity.canonicalUrl === normalizedUrl) {
      return MATCH_SCORE_DOMAIN;
    }
  }

  if (entity.title.trim().toLowerCase() === normalizedQuery.toLowerCase()) {
    return MATCH_SCORE_EXACT_TITLE;
  }

  if (canonicalRootId && entity.parentId === canonicalRootId) {
    return MATCH_SCORE_CHILD;
  }

  return MATCH_SCORE_PARTIAL;
}

function computeRankingScore(
  matchScore: number,
  isSiteRoot: boolean,
  metrics: SearchEntityMetrics
): number {
  return (
    matchScore * 100_000 +
    (isSiteRoot ? 10_000 : 0) +
    metrics.votesCount * 10 +
    metrics.reviewsCount
  );
}

function isSiteRootEntity(entity: SearchRankableEntity, urlNormalizer: UrlNormalizer): boolean {
  if (!entity.canonicalUrl) {
    return false;
  }

  return urlNormalizer.getSiteRootCanonicalUrl(entity.canonicalUrl) === entity.canonicalUrl;
}

function hostnameMatchesQuery(hostname: string, query: string): boolean {
  const normalizedHostname = normalizeHostname(hostname);
  const normalizedQuery = normalizeQueryToken(query);

  if (!normalizedHostname || !normalizedQuery) {
    return false;
  }

  if (normalizedHostname === normalizedQuery) {
    return true;
  }

  if (normalizedHostname.startsWith(`${normalizedQuery}.`)) {
    return true;
  }

  const hostnameBase = normalizedHostname.split(".")[0];
  const queryBase = normalizedQuery.split(".")[0];

  return hostnameBase === queryBase;
}

function buildDomainCandidates(query: string): string[] {
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    return [];
  }

  if (trimmedQuery.includes(".")) {
    return [trimmedQuery];
  }

  return [trimmedQuery, `${trimmedQuery}.com`, `${trimmedQuery}.ru`];
}

export function collectCanonicalRootLookupUrls(
  query: string,
  urlNormalizer: UrlNormalizer
): string[] {
  const normalizedQuery = query.trim();
  const lookupUrls = new Set<string>();

  if (!normalizedQuery) {
    return [];
  }

  const normalizedUrl = urlNormalizer.normalize(normalizedQuery);

  if (normalizedUrl) {
    lookupUrls.add(urlNormalizer.getSiteRootCanonicalUrl(normalizedUrl));
  }

  for (const candidate of buildDomainCandidates(normalizedQuery)) {
    const candidateUrl = urlNormalizer.normalize(candidate);

    if (candidateUrl) {
      lookupUrls.add(urlNormalizer.getSiteRootCanonicalUrl(candidateUrl));
    }
  }

  return [...lookupUrls];
}

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function normalizeQueryToken(query: string): string {
  return query.trim().toLowerCase().replace(/^www\./, "");
}

function createEmptyMetrics(): SearchEntityMetrics {
  return {
    avgScore: null,
    reviewsCount: 0,
    votesCount: 0
  };
}

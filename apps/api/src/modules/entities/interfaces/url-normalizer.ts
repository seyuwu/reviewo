export const URL_NORMALIZER = Symbol("URL_NORMALIZER");

export interface UrlNormalizer {
  getSiteRootCanonicalUrl(canonicalUrl: string): string;
  normalize(input: string): string | null;
}

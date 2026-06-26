export const URL_NORMALIZER = Symbol("URL_NORMALIZER");

export interface UrlNormalizer {
  normalize(input: string): string | null;
}

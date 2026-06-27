export function deriveTitleFromCanonicalUrl(canonicalUrl: string): string {
  return new URL(canonicalUrl).hostname;
}

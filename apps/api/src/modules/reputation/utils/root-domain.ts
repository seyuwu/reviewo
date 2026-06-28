export function extractRootDomain(canonicalUrl: string | null | undefined): string | null {
  if (!canonicalUrl) {
    return null;
  }

  try {
    const hostname = new URL(canonicalUrl).hostname.toLowerCase();

    if (hostname.startsWith("www.")) {
      return hostname.slice(4);
    }

    return hostname;
  } catch {
    return null;
  }
}

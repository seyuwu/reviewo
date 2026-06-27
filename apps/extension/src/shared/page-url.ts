export function isResolvablePageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function readCurrentPageUrl(): string {
  return window.location.href;
}

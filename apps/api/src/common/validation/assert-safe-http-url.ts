export const MAX_SAFE_HTTP_URL_LENGTH = 2048;

export class UnsafeHttpUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeHttpUrlError";
  }
}

export function assertSafeHttpUrl(input: string): string {
  const trimmedInput = input.trim();

  if (!trimmedInput) {
    throw new UnsafeHttpUrlError("URL is required");
  }

  if (trimmedInput.length > MAX_SAFE_HTTP_URL_LENGTH) {
    throw new UnsafeHttpUrlError(`URL must be at most ${MAX_SAFE_HTTP_URL_LENGTH} characters`);
  }

  let url: URL;

  try {
    url = new URL(trimmedInput);
  } catch {
    throw new UnsafeHttpUrlError("URL must be a valid HTTP or HTTPS URL");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new UnsafeHttpUrlError("URL must use HTTP or HTTPS");
  }

  if (!url.hostname) {
    throw new UnsafeHttpUrlError("URL must include a hostname");
  }

  return url.toString();
}

export function tryAssertSafeHttpUrl(input: string): string | null {
  try {
    return assertSafeHttpUrl(input);
  } catch {
    return null;
  }
}

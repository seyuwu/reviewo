export type OriginMatcher = (origin: string | undefined) => boolean;

const DEVELOPMENT_CHROME_EXTENSION_WILDCARD = "chrome-extension://*";

export function createOriginMatcher(allowedOrigins: string[]): OriginMatcher {
  const exactOrigins = new Set(
    allowedOrigins.filter((origin) => origin !== DEVELOPMENT_CHROME_EXTENSION_WILDCARD)
  );
  const allowAnyChromeExtension = allowedOrigins.includes(DEVELOPMENT_CHROME_EXTENSION_WILDCARD);

  return (origin: string | undefined): boolean => {
    if (!origin) {
      return true;
    }

    if (exactOrigins.has(origin)) {
      return true;
    }

    return allowAnyChromeExtension && origin.startsWith("chrome-extension://");
  };
}

export function createDevelopmentAllowedOrigins(): string[] {
  return ["http://localhost:3001", DEVELOPMENT_CHROME_EXTENSION_WILDCARD];
}

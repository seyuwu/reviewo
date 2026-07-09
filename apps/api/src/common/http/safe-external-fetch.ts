import { isIP } from "node:net";
import { lookup as dnsLookup } from "node:dns/promises";

export const SAFE_EXTERNAL_FETCH_MAX_BODY_BYTES = 512 * 1024;
export const SAFE_EXTERNAL_FETCH_MAX_REDIRECTS = 3;
export const SAFE_EXTERNAL_FETCH_TIMEOUT_MS = 5_000;

export class UnsafeExternalUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeExternalUrlError";
  }
}

export interface SafeExternalFetchOptions {
  fetchImpl?: typeof fetch;
  maxBodyBytes?: number;
  maxRedirects?: number;
  timeoutMs?: number;
}

export interface SafeExternalFetchResult {
  body: string;
  finalUrl: string;
}

export async function assertSafeExternalUrl(urlString: string): Promise<URL> {
  let url: URL;

  try {
    url = new URL(urlString.trim());
  } catch {
    throw new UnsafeExternalUrlError("URL must be a valid HTTP or HTTPS URL");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new UnsafeExternalUrlError("Only HTTP and HTTPS URLs are allowed");
  }

  const hostname = url.hostname.toLowerCase();

  if (!hostname || hostname.endsWith(".local")) {
    throw new UnsafeExternalUrlError("Hostname is not allowed");
  }

  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new UnsafeExternalUrlError("Localhost URLs are not allowed");
  }

  if (/^\d+$/.test(hostname)) {
    throw new UnsafeExternalUrlError("Numeric hostnames are not allowed");
  }

  if (isBlockedHostname(hostname)) {
    throw new UnsafeExternalUrlError("Hostname is not allowed");
  }

  await assertResolvablePublicAddresses(hostname);

  return url;
}

export async function safeExternalFetch(
  urlString: string,
  options: SafeExternalFetchOptions = {}
): Promise<SafeExternalFetchResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxBodyBytes = options.maxBodyBytes ?? SAFE_EXTERNAL_FETCH_MAX_BODY_BYTES;
  const maxRedirects = options.maxRedirects ?? SAFE_EXTERNAL_FETCH_MAX_REDIRECTS;
  const timeoutMs = options.timeoutMs ?? SAFE_EXTERNAL_FETCH_TIMEOUT_MS;

  let currentUrl = await assertSafeExternalUrl(urlString);

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(currentUrl.toString(), {
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": "ReviewoMetadataBot/1.0"
        },
        method: "GET",
        redirect: "manual",
        signal: controller.signal
      });

      if (isRedirectStatus(response.status)) {
        const location = response.headers.get("location");

        if (!location) {
          throw new UnsafeExternalUrlError("Redirect response is missing Location header");
        }

        if (redirectCount === maxRedirects) {
          throw new UnsafeExternalUrlError("Too many redirects");
        }

        currentUrl = await assertSafeExternalUrl(new URL(location, currentUrl).toString());
        continue;
      }

      if (!response.ok) {
        throw new UnsafeExternalUrlError(`External fetch failed with status ${response.status}`);
      }

      const body = await readResponseBodyWithLimit(response, maxBodyBytes);

      return {
        body,
        finalUrl: currentUrl.toString()
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new UnsafeExternalUrlError("External fetch failed");
}

function isRedirectStatus(status: number): boolean {
  return status >= 300 && status < 400;
}

async function readResponseBodyWithLimit(response: Response, maxBodyBytes: number): Promise<string> {
  const reader = response.body?.getReader();

  if (!reader) {
    return "";
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  for (;;) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    if (!value) {
      continue;
    }

    totalBytes += value.byteLength;

    if (totalBytes > maxBodyBytes) {
      throw new UnsafeExternalUrlError("Response body is too large");
    }

    chunks.push(value);
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function assertResolvablePublicAddresses(hostname: string): Promise<void> {
  const ipVersion = isIP(hostname);

  if (ipVersion) {
    if (isBlockedIpAddress(hostname, ipVersion)) {
      throw new UnsafeExternalUrlError("IP address is not allowed");
    }

    return;
  }

  const records = await dnsLookup(hostname, { all: true, verbatim: true });

  if (records.length === 0) {
    throw new UnsafeExternalUrlError("Hostname could not be resolved");
  }

  for (const record of records) {
    if (isBlockedIpAddress(record.address, record.family)) {
      throw new UnsafeExternalUrlError("Hostname resolves to a blocked address");
    }
  }
}

function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();

  if (normalized === "metadata.google.internal" || normalized === "metadata.goog") {
    return true;
  }

  return false;
}

function isBlockedIpAddress(address: string, family: number): boolean {
  if (family === 4) {
    return isBlockedIpv4(address);
  }

  if (family === 6) {
    return isBlockedIpv6(address);
  }

  return true;
}

function isBlockedIpv4(address: string): boolean {
  const parts = address.split(".").map((part) => Number(part));

  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }

  const a = parts[0]!;
  const b = parts[1]!;

  if (a === 0 || a === 10 || a === 127) {
    return true;
  }

  if (a === 169 && b === 254) {
    return true;
  }

  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }

  if (a === 192 && b === 168) {
    return true;
  }

  if (a === 100 && b >= 64 && b <= 127) {
    return true;
  }

  return false;
}

function isBlockedIpv6(address: string): boolean {
  const normalized = address.toLowerCase();

  if (normalized === "::1" || normalized === "::") {
    return true;
  }

  if (normalized.startsWith("fc") || normalized.startsWith("fd")) {
    return true;
  }

  if (normalized.startsWith("fe80:")) {
    return true;
  }

  if (normalized.startsWith("::ffff:")) {
    const mappedIpv4 = normalized.slice("::ffff:".length);

    if (isIP(mappedIpv4) === 4) {
      return isBlockedIpv4(mappedIpv4);
    }
  }

  return false;
}

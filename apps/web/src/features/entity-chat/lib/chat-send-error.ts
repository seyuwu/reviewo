export class ChatSendError extends Error {
  readonly retryAfterSeconds: number | undefined;

  constructor(message: string, retryAfterSeconds?: number) {
    super(message);
    this.name = "ChatSendError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function readRetryAfterSeconds(details: unknown): number | undefined {
  if (!details || typeof details !== "object" || !("retryAfterSeconds" in details)) {
    return undefined;
  }

  const value = (details as { retryAfterSeconds?: unknown }).retryAfterSeconds;

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.max(1, Math.ceil(value));
}

export function readRetryAfterSecondsFromApiBody(data: unknown): number | undefined {
  if (!data || typeof data !== "object" || !("error" in data)) {
    return undefined;
  }

  const error = (data as { error?: { details?: unknown } }).error;

  return readRetryAfterSeconds(error?.details);
}

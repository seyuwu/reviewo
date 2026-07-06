import { ApiError } from "./api-error";

export interface ApiErrorPayload {
  code?: string;
  details?: unknown;
  message?: string;
}

export interface ApiValidationErrorDetail {
  constraints: string[];
  path: string;
}

export function readApiErrorPayload(body: unknown): ApiErrorPayload | null {
  if (!body || typeof body !== "object" || !("error" in body)) {
    return null;
  }

  const error = (body as { error?: unknown }).error;

  if (!error || typeof error !== "object") {
    return null;
  }

  return error as ApiErrorPayload;
}

export function readApiErrorMessage(body: unknown): string | null {
  const message = readApiErrorPayload(body)?.message;

  return typeof message === "string" && message.trim() ? message : null;
}

export function readApiErrorCode(body: unknown): string | null {
  const code = readApiErrorPayload(body)?.code;

  return typeof code === "string" && code.trim() ? code : null;
}

export function readConflictEntityId(body: unknown): string | null {
  const details = readApiErrorPayload(body)?.details;

  if (!details || typeof details !== "object" || !("entityId" in details)) {
    return null;
  }

  const entityId = (details as { entityId?: unknown }).entityId;

  return typeof entityId === "string" ? entityId : null;
}

export function readRetryAfterMinutes(body: unknown): number | null {
  const details = readApiErrorPayload(body)?.details;

  if (!details || typeof details !== "object" || !("retryAfterSeconds" in details)) {
    return null;
  }

  const retryAfterSeconds = (details as { retryAfterSeconds?: unknown }).retryAfterSeconds;

  if (typeof retryAfterSeconds !== "number" || !Number.isFinite(retryAfterSeconds)) {
    return null;
  }

  return Math.max(1, Math.ceil(retryAfterSeconds / 60));
}

export function readValidationErrors(body: unknown): ApiValidationErrorDetail[] {
  const details = readApiErrorPayload(body)?.details;

  if (!Array.isArray(details)) {
    return [];
  }

  return details.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const path = "path" in item && typeof item.path === "string" ? item.path : "";
    const constraints =
      "constraints" in item && Array.isArray(item.constraints)
        ? item.constraints.filter((value: unknown): value is string => typeof value === "string")
        : [];

    if (!path || constraints.length === 0) {
      return [];
    }

    return [{ constraints, path }];
  });
}

export function formatValidationErrors(
  errors: ApiValidationErrorDetail[],
  fieldLabels: Record<string, string>,
  formatConstraint: (path: string, constraint: string) => string
): string | null {
  if (errors.length === 0) {
    return null;
  }

  const parts = errors.map((item) => {
    const label = fieldLabels[item.path] ?? item.path;
    const constraint = item.constraints[0] ?? "";

    return formatConstraint(item.path, constraint).replace("{field}", label);
  });

  return parts.join(" ");
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

import type { TranslateFn } from "@reviewo/i18n";

import {
  formatValidationErrors,
  isApiError,
  readApiErrorCode,
  readApiErrorMessage,
  readConflictEntityId,
  readRetryAfterMinutes,
  readValidationErrors
} from "../../../lib/api/read-api-error";

export interface ResolvedEntityCreateError {
  existingEntityId: string | null;
  message: string;
}

export function resolveEntityCreateError(error: unknown, t: TranslateFn): ResolvedEntityCreateError {
  if (!isApiError(error)) {
    return {
      existingEntityId: null,
      message: t("web.entityCreate.failed")
    };
  }

  if (error.status === 401) {
    return {
      existingEntityId: null,
      message: t("web.entityCreate.signInRequired")
    };
  }

  if (error.status === 429 || readApiErrorCode(error.body) === "TOO_MANY_REQUESTS") {
    const retryMinutes = readRetryAfterMinutes(error.body);

    return {
      existingEntityId: null,
      message: retryMinutes
        ? t("web.entityCreate.rateLimited", { minutes: retryMinutes })
        : t("web.entityCreate.rateLimitedGeneric")
    };
  }

  if (error.status === 409 || readApiErrorCode(error.body) === "CONFLICT") {
    const existingEntityId = readConflictEntityId(error.body);
    const apiMessage = readApiErrorMessage(error.body);

    return {
      existingEntityId,
      message: mapConflictMessage(apiMessage, t)
    };
  }

  if (error.status === 400) {
    const validationMessage = formatValidationErrors(
      readValidationErrors(error.body),
      {
        canonicalUrl: t("web.entityCreate.canonicalUrl"),
        description: t("web.entityCreate.descriptionLabel"),
        title: t("web.entityCreate.titleLabel"),
        type: t("web.entityCreate.typeLabel")
      },
      (path, constraint) => formatValidationConstraint(path, constraint, t)
    );

    if (validationMessage) {
      return {
        existingEntityId: null,
        message: validationMessage
      };
    }
  }

  const apiMessage = readApiErrorMessage(error.body);

  if (apiMessage) {
    const mappedMessage = mapKnownApiMessage(apiMessage, t);

    if (mappedMessage) {
      return {
        existingEntityId: readConflictEntityId(error.body),
        message: mappedMessage
      };
    }
  }

  return {
    existingEntityId: null,
    message: t("web.entityCreate.failed")
  };
}

function mapConflictMessage(apiMessage: string | null, t: TranslateFn): string {
  if (apiMessage === "Entity with this canonical URL already exists") {
    return t("web.entityCreate.alreadyExistsUrl");
  }

  if (apiMessage === "Entity with this slug or canonical URL already exists") {
    return t("web.entityCreate.alreadyExistsSlug");
  }

  return t("web.entityCreate.alreadyExists");
}

function mapKnownApiMessage(apiMessage: string, t: TranslateFn): string | null {
  switch (apiMessage) {
    case "Entity with this canonical URL already exists":
      return t("web.entityCreate.alreadyExistsUrl");
    case "Entity with this slug or canonical URL already exists":
      return t("web.entityCreate.alreadyExistsSlug");
    case "Parent entity was not found":
      return t("web.entityCreate.parentNotFound");
    case "Too many entity creation attempts from this account":
    case "Too many entity creation attempts from this network":
      return t("web.entityCreate.rateLimitedGeneric");
    case "Validation failed":
      return null;
    default:
      return null;
  }
}

function formatValidationConstraint(path: string, constraint: string, t: TranslateFn): string {
  const normalized = constraint.toLowerCase();

  if (path === "canonicalUrl" && normalized.includes("must be a url")) {
    return t("web.entityCreate.validationCanonicalUrl");
  }

  if (normalized.includes("must be shorter than or equal to")) {
    return t("web.entityCreate.validationTooLong", { field: "{field}" });
  }

  if (normalized.includes("must be longer than or equal to")) {
    return t("web.entityCreate.validationTooShort", { field: "{field}" });
  }

  if (normalized.includes("must be one of the following values")) {
    return t("web.entityCreate.validationInvalidType", { field: "{field}" });
  }

  return t("web.entityCreate.validationField", { field: "{field}", reason: constraint });
}

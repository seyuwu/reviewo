import type { TranslateFn } from "@reviewo/i18n";

import {
  formatValidationErrors,
  isApiError,
  readApiErrorMessage,
  readValidationErrors
} from "../../../lib/api/read-api-error";

const FIELD_LABELS: Record<string, string> = {
  dotaAccountId: "Dota Account ID",
  displayName: "displayName",
  email: "email",
  mmr: "mmr",
  password: "password",
  roles: "roles"
};

export function resolveDotaFormError(
  error: unknown,
  t: TranslateFn,
  mode: "create" | "update"
): string {
  if (!isApiError(error)) {
    return mode === "update" ? t("dota.create.errorUpdate") : t("dota.create.error");
  }

  const apiMessage = readApiErrorMessage(error.body);

  if (apiMessage === "You already have a Dota profile") {
    return t("dota.create.errorAlreadyExists");
  }

  if (apiMessage === "This Dota Account ID is already linked to another profile") {
    return t("dota.create.errorDotaIdTaken");
  }

  const validationMessage = formatValidationErrors(
    readValidationErrors(error.body),
    FIELD_LABELS,
    (path, constraint) => {
      if (path === "dotaAccountId") {
        return t("dota.create.validation.dotaAccountId");
      }

      if (path === "roles") {
        return t("dota.create.rolesRequired");
      }

      if (path === "mmr") {
        return t("dota.create.mmrRequired");
      }

      return constraint || t("dota.create.error");
    }
  );

  if (validationMessage) {
    return validationMessage;
  }

  if (apiMessage) {
    return apiMessage;
  }

  if (error.status >= 500) {
    return t("dota.create.errorApiUnavailable");
  }

  return mode === "update" ? t("dota.create.errorUpdate") : t("dota.create.error");
}

export function isDotaProfileAlreadyExistsError(error: unknown): boolean {
  return (
    isApiError(error) &&
    error.status === 409 &&
    readApiErrorMessage(error.body) === "You already have a Dota profile"
  );
}

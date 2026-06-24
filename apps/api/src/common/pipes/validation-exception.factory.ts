import type { ValidationError } from "class-validator";

import { ValidationException } from "../exceptions/validation.exception.js";
import type { ValidationErrorDetail } from "../exceptions/validation.exception.js";

export function createValidationException(errors: ValidationError[]): ValidationException {
  return new ValidationException(flattenValidationErrors(errors));
}

function flattenValidationErrors(
  errors: ValidationError[],
  parentPath?: string
): ValidationErrorDetail[] {
  return errors.flatMap((error) => {
    const currentPath = parentPath ? `${parentPath}.${error.property}` : error.property;
    const constraints = Object.values(error.constraints ?? {});
    const currentError =
      constraints.length > 0
        ? [
            {
              constraints,
              path: currentPath
            }
          ]
        : [];

    return [...currentError, ...flattenValidationErrors(error.children ?? [], currentPath)];
  });
}

import { ValidateBy, type ValidationOptions } from "class-validator";

import { isValidDotaMmr } from "@reviewo/shared";

export function IsDotaMmr(validationOptions?: ValidationOptions) {
  return ValidateBy(
    {
      name: "isDotaMmr",
      validator: {
        validate: (value: unknown) => typeof value === "string" && isValidDotaMmr(value),
        defaultMessage: () => "mmr must be a number or range up to 18000"
      }
    },
    validationOptions
  );
}

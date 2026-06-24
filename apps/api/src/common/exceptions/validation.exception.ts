import { HttpStatus } from "@nestjs/common";

import type { ApiErrorBody } from "../filters/api-error-response.js";
import { AppErrorCode } from "./app-error-code.js";
import { AppException } from "./app.exception.js";

export interface ValidationErrorDetail {
  constraints: string[];
  path: string;
}

export class ValidationException extends AppException {
  constructor(details: ValidationErrorDetail[]) {
    const error: ApiErrorBody = {
      code: AppErrorCode.ValidationError,
      details,
      message: "Validation failed"
    };

    super(HttpStatus.BAD_REQUEST, error);
  }
}

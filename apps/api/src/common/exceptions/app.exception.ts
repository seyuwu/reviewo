import { HttpException } from "@nestjs/common";

import type { ApiErrorBody } from "../filters/api-error-response.js";
import type { AppErrorCode } from "./app-error-code.js";

export class AppException extends HttpException {
  constructor(statusCode: number, error: ApiErrorBody) {
    super(error, statusCode);
  }

  getErrorResponse(): ApiErrorBody {
    return this.getResponse() as ApiErrorBody;
  }
}

export interface AppExceptionOptions {
  code: AppErrorCode | string;
  details?: unknown;
  message: string;
  statusCode: number;
}

export function createAppException(options: AppExceptionOptions): AppException {
  return new AppException(options.statusCode, {
    code: options.code,
    details: options.details,
    message: options.message
  });
}

import type { AppErrorCode } from "../exceptions/app-error-code.js";

export interface ApiErrorBody {
  code: AppErrorCode | string;
  details?: unknown;
  message: string;
}

export interface ApiErrorResponse {
  error: ApiErrorBody;
  path: string;
  statusCode: number;
  timestamp: string;
}

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable
} from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";

import { AppLogger } from "../logger/app-logger.service.js";
import { AppErrorCode } from "../exceptions/app-error-code.js";
import { AppException } from "../exceptions/app.exception.js";
import type { ApiErrorBody, ApiErrorResponse } from "./api-error-response.js";

interface HttpRequestLike {
  url?: string;
}

@Catch()
@Injectable()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly logger: AppLogger
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const httpContext = host.switchToHttp();
    const request = httpContext.getRequest<HttpRequestLike>();
    const response = httpContext.getResponse<unknown>();
    const statusCode = getStatusCode(exception);
    const error = getErrorBody(exception, statusCode);
    const body: ApiErrorResponse = {
      error,
      path: request.url ?? "unknown",
      statusCode,
      timestamp: new Date().toISOString()
    };

    if (!(exception instanceof HttpException)) {
      this.logger.error(
        "Unhandled application error",
        getErrorStack(exception),
        "GlobalExceptionFilter"
      );
    }

    this.httpAdapterHost.httpAdapter.reply(response, body, statusCode);
  }
}

function getStatusCode(exception: unknown): number {
  if (exception instanceof HttpException) {
    return exception.getStatus();
  }

  return HttpStatus.INTERNAL_SERVER_ERROR;
}

function getErrorBody(exception: unknown, statusCode: number): ApiErrorBody {
  if (exception instanceof AppException) {
    return exception.getErrorResponse();
  }

  if (exception instanceof HttpException) {
    return normalizeHttpException(exception, statusCode);
  }

  return {
    code: AppErrorCode.InternalServerError,
    message: "Internal server error"
  };
}

function normalizeHttpException(exception: HttpException, statusCode: number): ApiErrorBody {
  const response = exception.getResponse();

  if (isApiErrorBody(response)) {
    return response;
  }

  return {
    code: getErrorCodeByStatus(statusCode),
    message: getHttpExceptionMessage(response, exception.message)
  };
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<ApiErrorBody>;

  return typeof candidate.code === "string" && typeof candidate.message === "string";
}

function getHttpExceptionMessage(response: unknown, fallback: string): string {
  if (typeof response === "string") {
    return response;
  }

  if (typeof response === "object" && response !== null && "message" in response) {
    const message = (response as { message?: unknown }).message;

    if (typeof message === "string") {
      return message;
    }

    if (Array.isArray(message) && message.every((item) => typeof item === "string")) {
      return message.join("; ");
    }
  }

  return fallback;
}

function getErrorCodeByStatus(statusCode: number): AppErrorCode {
  switch (statusCode) {
    case HttpStatus.BAD_REQUEST:
      return AppErrorCode.BadRequest;
    case HttpStatus.UNAUTHORIZED:
      return AppErrorCode.Unauthorized;
    case HttpStatus.FORBIDDEN:
      return AppErrorCode.Forbidden;
    case HttpStatus.NOT_FOUND:
      return AppErrorCode.NotFound;
    case HttpStatus.CONFLICT:
      return AppErrorCode.Conflict;
    case HttpStatus.SERVICE_UNAVAILABLE:
      return AppErrorCode.ServiceUnavailable;
    default:
      return AppErrorCode.InternalServerError;
  }
}

function getErrorStack(exception: unknown): string | undefined {
  return exception instanceof Error ? exception.stack : undefined;
}

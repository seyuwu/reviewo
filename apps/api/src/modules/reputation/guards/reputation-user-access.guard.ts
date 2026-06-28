import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
  SetMetadata
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { AppErrorCode } from "../../../common/exceptions/app-error-code.js";
import { createAppException } from "../../../common/exceptions/app.exception.js";
import type { AuthenticatedRequest } from "../../../common/interfaces/authenticated-request.js";

export const REPUTATION_USER_ID_PARAM_KEY = "reputationUserIdParam";

interface AuthenticatedRequestWithParams extends AuthenticatedRequest {
  params: Record<string, string | undefined>;
}

export function ReputationUserIdParam(paramName: string): MethodDecorator {
  return SetMetadata(REPUTATION_USER_ID_PARAM_KEY, paramName);
}

@Injectable()
export class ReputationUserAccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequestWithParams>();
    const paramName =
      this.reflector.get<string>(REPUTATION_USER_ID_PARAM_KEY, context.getHandler()) ?? "id";
    const requestedUserId = request.params[paramName];

    if (!request.user) {
      throw createAppException({
        code: AppErrorCode.Unauthorized,
        message: "Authentication required",
        statusCode: HttpStatus.UNAUTHORIZED
      });
    }

    if (request.user.role === "ADMIN" || request.user.id === requestedUserId) {
      return true;
    }

    throw createAppException({
      code: AppErrorCode.Forbidden,
      message: "You can only access your own trust profile",
      statusCode: HttpStatus.FORBIDDEN
    });
  }
}

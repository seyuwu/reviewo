import { CanActivate, ExecutionContext, HttpStatus, Injectable } from "@nestjs/common";

import { AppErrorCode } from "../../../common/exceptions/app-error-code.js";
import { createAppException } from "../../../common/exceptions/app.exception.js";
import type { AuthenticatedRequest } from "../../../common/interfaces/authenticated-request.js";

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (request.user?.role !== "ADMIN") {
      throw createAppException({
        code: AppErrorCode.Forbidden,
        message: "Admin access required",
        statusCode: HttpStatus.FORBIDDEN
      });
    }

    return true;
  }
}

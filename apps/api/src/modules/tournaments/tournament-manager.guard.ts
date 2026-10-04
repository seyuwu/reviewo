import { CanActivate, ExecutionContext, HttpStatus, Injectable } from "@nestjs/common";

import { AppErrorCode } from "../../common/exceptions/app-error-code.js";
import { createAppException } from "../../common/exceptions/app.exception.js";
import type { AuthenticatedRequest } from "../../common/interfaces/authenticated-request.js";

@Injectable()
export class TournamentManagerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const role = request.user?.role;

    if (role !== "ADMIN" && role !== "TOURNAMENT_MODERATOR") {
      throw createAppException({
        code: AppErrorCode.Forbidden,
        message: "Tournament management access required",
        statusCode: HttpStatus.FORBIDDEN
      });
    }

    return true;
  }
}

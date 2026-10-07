import { CanActivate, ExecutionContext, HttpStatus, Injectable } from "@nestjs/common";

import { AppErrorCode } from "../../common/exceptions/app-error-code.js";
import { createAppException } from "../../common/exceptions/app.exception.js";
import type { AuthenticatedRequest } from "../../common/interfaces/authenticated-request.js";
import { PrismaService } from "../../database/prisma.service.js";

@Injectable()
export class TournamentTelegramLinkedGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user || user.status !== "active") {
      throw createAppException({
        code: AppErrorCode.Unauthorized,
        message: "Authentication required",
        statusCode: HttpStatus.UNAUTHORIZED
      });
    }

    const identity = await this.prisma.userAuthIdentity.findFirst({
      select: { id: true },
      where: { provider: "telegram", userId: user.id }
    });

    if (!identity) {
      throw createAppException({
        code: AppErrorCode.Forbidden,
        message: "Connect the FDP Telegram bot to use tournaments",
        statusCode: HttpStatus.FORBIDDEN
      });
    }

    return true;
  }
}

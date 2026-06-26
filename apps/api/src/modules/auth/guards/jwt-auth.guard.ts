import { CanActivate, ExecutionContext, HttpStatus, Injectable } from "@nestjs/common";

import { AppErrorCode } from "../../../common/exceptions/app-error-code.js";
import { createAppException } from "../../../common/exceptions/app.exception.js";
import type { AuthenticatedRequest } from "../../../common/interfaces/authenticated-request.js";
import { UsersService } from "../../users/services/users.service.js";
import { JwtTokenService } from "../services/jwt-token.service.js";

interface BearerRequest extends AuthenticatedRequest {
  headers: {
    authorization?: string | string[];
  };
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtTokenService: JwtTokenService,
    private readonly usersService: UsersService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<BearerRequest>();
    const token = getBearerToken(request.headers.authorization);

    if (!token) {
      throw createUnauthorizedException();
    }

    const verifiedToken = this.jwtTokenService.verifyAccessToken(token);

    if (!verifiedToken) {
      throw createUnauthorizedException();
    }

    const user = await this.usersService.findAuthenticatedUserById(verifiedToken.userId);

    if (!user) {
      throw createUnauthorizedException();
    }

    request.user = user;

    return true;
  }
}

function getBearerToken(value: string | string[] | undefined): string | null {
  const authorization = Array.isArray(value) ? value[0] : value;

  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(" ");

  if (scheme !== "Bearer" || !token) {
    return null;
  }

  return token;
}

function createUnauthorizedException(): Error {
  return createAppException({
    code: AppErrorCode.Unauthorized,
    message: "Authentication required",
    statusCode: HttpStatus.UNAUTHORIZED
  });
}

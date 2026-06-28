import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";

import type { AuthenticatedRequest } from "../../../common/interfaces/authenticated-request.js";
import { UsersService } from "../../users/services/users.service.js";
import { parseBearerToken } from "../lib/parse-bearer-token.js";
import { JwtTokenService } from "../services/jwt-token.service.js";

interface BearerRequest extends AuthenticatedRequest {
  headers: {
    authorization?: string | string[];
  };
}

@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtTokenService: JwtTokenService,
    private readonly usersService: UsersService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<BearerRequest>();
    const token = parseBearerToken(request.headers.authorization);

    if (!token) {
      return true;
    }

    const verifiedToken = this.jwtTokenService.verifyAccessToken(token);

    if (!verifiedToken) {
      return true;
    }

    const user = await this.usersService.findAuthenticatedUserById(verifiedToken.userId);

    if (user) {
      request.user = user;
    }

    return true;
  }
}

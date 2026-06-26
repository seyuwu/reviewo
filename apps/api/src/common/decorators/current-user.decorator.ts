import { createParamDecorator, ExecutionContext } from "@nestjs/common";

import type {
  AuthenticatedRequest,
  AuthenticatedUser
} from "../interfaces/authenticated-request.js";

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser | undefined => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    return request.user;
  }
);

import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { AppErrorCode } from "../../../common/exceptions/app-error-code.js";
import { createAppException } from "../../../common/exceptions/app.exception.js";
import type { ApplicationConfig } from "../../../config/environment.config.js";

@Injectable()
export class ReputationEngineEnabledGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    void context;
    const enabled = this.configService.get<ApplicationConfig>("app")?.reputationEngineEnabled;

    if (!enabled) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Reputation engine is disabled",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    return true;
  }
}

import "reflect-metadata";

import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { IoAdapter } from "@nestjs/platform-socket.io";
import type { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";
import type { IncomingMessage } from "node:http";
import type { ServerOptions } from "socket.io";

import { AppModule } from "./app.module.js";
import { GlobalExceptionFilter } from "./common/filters/global-exception.filter.js";
import { AppLogger } from "./common/logger/app-logger.service.js";
import { createValidationException } from "./common/pipes/validation-exception.factory.js";
import type { EnvironmentVariables } from "./config/environment.validation.js";
import { createOriginMatcher, type OriginMatcher } from "./config/origin-policy.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true
  });

  // Avatars are sent as JPEG data URLs (DTO max ~350KB); default Express limit is 100KB.
  app.useBodyParser("json", { limit: "512kb" });
  app.useBodyParser("urlencoded", { extended: true, limit: "512kb" });

  const logger = app.get(AppLogger);
  app.useLogger(logger);

  app.useGlobalPipes(
    new ValidationPipe({
      exceptionFactory: createValidationException,
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true
    })
  );
  app.useGlobalFilters(app.get(GlobalExceptionFilter));

  app.enableShutdownHooks();

  const configService = app.get(ConfigService<EnvironmentVariables, true>);
  const corsAllowedOrigins = configService.get("CORS_ALLOWED_ORIGINS", { infer: true });
  const port = configService.get("API_PORT", { infer: true });
  const trustProxyHops = configService.get("TRUST_PROXY_HOPS", { infer: true });
  const isAllowedOrigin = createOriginMatcher(corsAllowedOrigins);

  app.use(helmet());

  if (trustProxyHops > 0) {
    app.set("trust proxy", trustProxyHops);
  }

  app.useWebSocketAdapter(new OriginRestrictedIoAdapter(app, isAllowedOrigin));

  if (corsAllowedOrigins.length > 0) {
    app.enableCors({
      allowedHeaders: ["Authorization", "Content-Type", "x-opinia-voter"],
      methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      origin: (origin, callback) => {
        callback(null, isAllowedOrigin(origin));
      }
    });
  }

  await app.listen(port);
  logger.log(`API application is running on port ${port}`, "Bootstrap");
}

void bootstrap();

class OriginRestrictedIoAdapter extends IoAdapter {
  constructor(
    app: NestExpressApplication,
    private readonly isAllowedOrigin: OriginMatcher
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions): unknown {
    return super.createIOServer(port, {
      ...options,
      allowRequest: (request: IncomingMessage, callback: AllowRequestCallback) => {
        callback(null, this.isAllowedOrigin(request.headers.origin));
      },
      cors: {
        ...(typeof options?.cors === "object" ? options.cors : {}),
        origin: (origin: string | undefined, callback: CorsOriginCallback) => {
          callback(null, this.isAllowedOrigin(origin));
        }
      }
    });
  }
}

type AllowRequestCallback = (error: string | null | undefined, success: boolean) => void;
type CorsOriginCallback = (error: Error | null, allow?: boolean) => void;

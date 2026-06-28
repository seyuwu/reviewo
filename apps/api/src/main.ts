import "reflect-metadata";

import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { IoAdapter } from "@nestjs/platform-socket.io";

import { AppModule } from "./app.module.js";
import { GlobalExceptionFilter } from "./common/filters/global-exception.filter.js";
import { AppLogger } from "./common/logger/app-logger.service.js";
import { createValidationException } from "./common/pipes/validation-exception.factory.js";
import type { EnvironmentVariables } from "./config/environment.validation.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true
  });

  const logger = app.get(AppLogger);
  app.useLogger(logger);
  app.useWebSocketAdapter(new IoAdapter(app));

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

  if (corsAllowedOrigins.length > 0) {
    app.enableCors({
      origin: corsAllowedOrigins
    });
  }

  await app.listen(port);
  logger.log(`API application is running on port ${port}`, "Bootstrap");
}

void bootstrap();

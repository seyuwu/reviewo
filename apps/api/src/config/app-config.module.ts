import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { environmentConfig } from "./environment.config.js";
import { validateEnvironment } from "./environment.validation.js";

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      load: [environmentConfig],
      validate: validateEnvironment
    })
  ]
})
export class AppConfigModule {}

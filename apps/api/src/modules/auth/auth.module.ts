import { Module } from "@nestjs/common";

import { UsersModule } from "../users/users.module.js";
import { AnalyticsModule } from "../analytics/analytics.module.js";
import { AuthController } from "./controllers/auth.controller.js";
import { AdminGuard } from "./guards/admin.guard.js";
import { JwtAuthGuard } from "./guards/jwt-auth.guard.js";
import { OptionalJwtAuthGuard } from "./guards/optional-jwt-auth.guard.js";
import { AuthRepository } from "./repositories/auth.repository.js";
import { AuthService } from "./services/auth.service.js";
import { DiscordOauthService } from "./services/discord-oauth.service.js";
import { JwtTokenService } from "./services/jwt-token.service.js";
import { PasswordHasherService } from "./services/password-hasher.service.js";

@Module({
  controllers: [AuthController],
  exports: [AdminGuard, AuthService, JwtAuthGuard, JwtTokenService, OptionalJwtAuthGuard],
  imports: [UsersModule, AnalyticsModule],
  providers: [
    AdminGuard,
    AuthRepository,
    AuthService,
    DiscordOauthService,
    JwtAuthGuard,
    OptionalJwtAuthGuard,
    JwtTokenService,
    PasswordHasherService
  ]
})
export class AuthModule {}

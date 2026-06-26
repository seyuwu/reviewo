import { Module } from "@nestjs/common";

import { UsersModule } from "../users/users.module.js";
import { AuthController } from "./controllers/auth.controller.js";
import { JwtAuthGuard } from "./guards/jwt-auth.guard.js";
import { AuthRepository } from "./repositories/auth.repository.js";
import { AuthService } from "./services/auth.service.js";
import { JwtTokenService } from "./services/jwt-token.service.js";
import { PasswordHasherService } from "./services/password-hasher.service.js";

@Module({
  controllers: [AuthController],
  exports: [JwtAuthGuard, JwtTokenService],
  imports: [UsersModule],
  providers: [AuthRepository, AuthService, JwtAuthGuard, JwtTokenService, PasswordHasherService]
})
export class AuthModule {}

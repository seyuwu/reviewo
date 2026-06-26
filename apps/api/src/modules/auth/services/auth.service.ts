import { HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { User } from "@prisma/client";

import { AppErrorCode } from "../../../common/exceptions/app-error-code.js";
import { createAppException } from "../../../common/exceptions/app.exception.js";
import type { AuthenticatedUser } from "../../../common/interfaces/authenticated-request.js";
import type { EnvironmentVariables } from "../../../config/environment.validation.js";
import { PrismaService } from "../../../database/prisma.service.js";
import { UsersService } from "../../users/services/users.service.js";
import { AuthRepository } from "../repositories/auth.repository.js";
import { AuthResponseDto } from "../dto/auth-response.dto.js";
import { LoginDto } from "../dto/login.dto.js";
import { RegisterDto } from "../dto/register.dto.js";
import { JwtTokenService } from "./jwt-token.service.js";
import { PasswordHasherService } from "./password-hasher.service.js";

@Injectable()
export class AuthService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly configService: ConfigService<EnvironmentVariables, true>,
    private readonly jwtTokenService: JwtTokenService,
    private readonly passwordHasherService: PasswordHasherService,
    private readonly prismaService: PrismaService,
    private readonly usersService: UsersService
  ) {}

  async register(input: RegisterDto): Promise<AuthResponseDto> {
    const email = this.usersService.normalizeEmail(input.email);
    const existingIdentity = await this.authRepository.findEmailIdentity(email);

    if (existingIdentity) {
      throw createEmailAlreadyExistsException();
    }

    await this.usersService.ensureEmailAvailable(email);

    const passwordHash = await this.passwordHasherService.hash(input.password);

    try {
      const user = await this.prismaService.$transaction(async (transaction) => {
        const createdUser = await this.usersService.createUserProfileForRegistration(
          {
            displayName: input.displayName,
            email
          },
          transaction
        );

        await this.authRepository.createEmailIdentity(
          {
            email,
            passwordHash,
            userId: createdUser.id
          },
          transaction
        );

        return createdUser;
      });

      return this.createAuthResponse(user);
    } catch (error) {
      if (this.authRepository.isUniqueConstraintError(error)) {
        throw createEmailAlreadyExistsException();
      }

      throw error;
    }
  }

  async login(input: LoginDto): Promise<AuthResponseDto> {
    const email = this.usersService.normalizeEmail(input.email);
    const identity = await this.authRepository.findEmailIdentity(email);

    if (!identity?.passwordHash || identity.user.status !== "active") {
      throw createInvalidCredentialsException();
    }

    const isPasswordValid = await this.passwordHasherService.verify(
      input.password,
      identity.passwordHash
    );

    if (!isPasswordValid) {
      throw createInvalidCredentialsException();
    }

    return this.createAuthResponse(toAuthenticatedUser(identity.user));
  }

  createCurrentUserResponse(user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }

  private createAuthResponse(user: AuthenticatedUser): AuthResponseDto {
    return {
      accessToken: this.jwtTokenService.signAccessToken(user.id),
      expiresIn: this.configService.get("JWT_ACCESS_TOKEN_TTL_SECONDS", { infer: true }),
      tokenType: "Bearer",
      user
    };
  }
}

function toAuthenticatedUser(user: User): AuthenticatedUser {
  return {
    displayName: user.displayName,
    email: user.email,
    id: user.id,
    status: user.status,
    username: user.username
  };
}

function createEmailAlreadyExistsException(): Error {
  return createAppException({
    code: AppErrorCode.Conflict,
    message: "User with this email already exists",
    statusCode: HttpStatus.CONFLICT
  });
}

function createInvalidCredentialsException(): Error {
  return createAppException({
    code: AppErrorCode.Unauthorized,
    message: "Invalid email or password",
    statusCode: HttpStatus.UNAUTHORIZED
  });
}

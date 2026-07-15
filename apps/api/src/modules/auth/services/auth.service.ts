import { HttpStatus, Injectable, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { User } from "#prisma/client";

import { AppErrorCode } from "../../../common/exceptions/app-error-code.js";
import { createAppException } from "../../../common/exceptions/app.exception.js";
import type { AuthenticatedUser } from "../../../common/interfaces/authenticated-request.js";
import type { EnvironmentVariables } from "../../../config/environment.validation.js";
import { PrismaService } from "../../../database/prisma.service.js";
import { ProductAnalyticsService } from "../../analytics/services/product-analytics.service.js";
import { UsersService } from "../../users/services/users.service.js";
import { AuthRepository } from "../repositories/auth.repository.js";
import { AuthResponseDto } from "../dto/auth-response.dto.js";
import { ChangePasswordDto } from "../dto/change-password.dto.js";
import { ClaimEmailDto } from "../dto/claim-email.dto.js";
import { LoginDto } from "../dto/login.dto.js";
import { RecoverAccountResponseDto } from "../dto/recover-account-response.dto.js";
import { RegisterDto } from "../dto/register.dto.js";
import { UpdateCurrentUserDto } from "../dto/update-current-user.dto.js";
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
    private readonly usersService: UsersService,
    @Optional() private readonly productAnalyticsService?: ProductAnalyticsService
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

      void this.productAnalyticsService?.recordRegistration().catch(() => undefined);

      return this.createAuthResponse(user);
    } catch (error) {
      if (this.authRepository.isUniqueConstraintError(error)) {
        throw createEmailAlreadyExistsException();
      }

      throw error;
    }
  }

  async createGuestAccount(displayName: string): Promise<{
    auth: AuthResponseDto;
    recoveryToken: string;
    recoveryUrl: string;
    user: AuthenticatedUser;
  }> {
    const recoveryToken = this.authRepository.createRecoveryTokenPlaintext();
    const recoveryTokenHash = this.authRepository.hashRecoveryToken(recoveryToken);

    const user = await this.prismaService.$transaction(async (transaction) => {
      const createdUser = await this.usersService.createGuestUserProfile({ displayName }, transaction);
      await this.authRepository.createGuestIdentity(createdUser.id, transaction);
      await this.authRepository.createRecoveryToken(createdUser.id, recoveryTokenHash, transaction);
      return createdUser;
    });

    void this.productAnalyticsService?.recordRegistration().catch(() => undefined);

    return {
      auth: this.createAuthResponse(user),
      recoveryToken,
      recoveryUrl: this.buildRecoveryUrl(recoveryToken),
      user
    };
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

  async recoverAccount(token: string): Promise<RecoverAccountResponseDto> {
    const tokenHash = this.authRepository.hashRecoveryToken(token);
    const existing = await this.authRepository.findActiveRecoveryTokenByHash(tokenHash);

    if (!existing || existing.user.status !== "active") {
      throw createInvalidRecoveryTokenException();
    }

    const nextRecoveryToken = this.authRepository.createRecoveryTokenPlaintext();
    const nextRecoveryTokenHash = this.authRepository.hashRecoveryToken(nextRecoveryToken);

    await this.prismaService.$transaction(async (transaction) => {
      await this.authRepository.consumeRecoveryToken(existing.id, transaction);
      await this.authRepository.createRecoveryToken(existing.userId, nextRecoveryTokenHash, transaction);
    });

    const auth = this.createAuthResponse(toAuthenticatedUser(existing.user));

    return {
      ...auth,
      recoveryToken: nextRecoveryToken,
      recoveryUrl: this.buildRecoveryUrl(nextRecoveryToken)
    };
  }

  async claimEmail(currentUser: AuthenticatedUser, input: ClaimEmailDto): Promise<AuthenticatedUser> {
    if (currentUser.email) {
      throw createAppException({
        code: AppErrorCode.Conflict,
        message: "Account already has an email",
        statusCode: HttpStatus.CONFLICT
      });
    }

    const email = this.usersService.normalizeEmail(input.email);
    const existingIdentity = await this.authRepository.findEmailIdentity(email);

    if (existingIdentity) {
      throw createEmailAlreadyExistsException();
    }

    await this.usersService.ensureEmailAvailable(email);

    const passwordHash = await this.passwordHasherService.hash(input.password);

    try {
      return await this.prismaService.$transaction(async (transaction) => {
        const updatedUser = await this.usersService.updateUserProfile(
          currentUser.id,
          {
            displayName: currentUser.displayName,
            email,
            username: currentUser.username
          },
          transaction
        );

        await this.authRepository.createEmailIdentity(
          {
            email,
            passwordHash,
            userId: currentUser.id
          },
          transaction
        );

        await this.authRepository.consumeActiveRecoveryTokensForUser(currentUser.id, transaction);

        return updatedUser;
      });
    } catch (error) {
      if (this.authRepository.isUniqueConstraintError(error)) {
        throw createEmailAlreadyExistsException();
      }

      throw error;
    }
  }

  createCurrentUserResponse(user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }

  async updateCurrentUserProfile(
    currentUser: AuthenticatedUser,
    input: UpdateCurrentUserDto
  ): Promise<AuthenticatedUser> {
    const email = this.usersService.normalizeEmail(input.email);
    const username = input.username ?? null;
    const identity = await this.authRepository.findEmailIdentityByUserId(currentUser.id);
    const isEmailChanging = email !== currentUser.email;

    if (isEmailChanging && !identity?.passwordHash) {
      throw createInvalidCurrentPasswordException();
    }

    if (isEmailChanging) {
      const isPasswordValid =
        input.currentPassword &&
        identity?.passwordHash &&
        (await this.passwordHasherService.verify(input.currentPassword, identity.passwordHash));

      if (!isPasswordValid) {
        throw createInvalidCurrentPasswordException();
      }
    }

    await this.usersService.ensureEmailAvailableForUser(email, currentUser.id);
    await this.usersService.ensureUsernameAvailableForUser(username, currentUser.id);

    try {
      return await this.prismaService.$transaction(async (transaction) => {
        const updatedUser = await this.usersService.updateUserProfile(
          currentUser.id,
          {
            displayName: input.displayName,
            email,
            username
          },
          transaction
        );

        if (identity && isEmailChanging) {
          await this.authRepository.updateEmailIdentity(
            identity.id,
            {
              email
            },
            transaction
          );
        }

        return updatedUser;
      });
    } catch (error) {
      if (this.authRepository.isUniqueConstraintError(error)) {
        throw createEmailAlreadyExistsException();
      }

      throw error;
    }
  }

  async updateCurrentUserAvatar(
    currentUser: AuthenticatedUser,
    imageDataUrl: string
  ): Promise<AuthenticatedUser> {
    return this.usersService.updateUserAvatar(currentUser.id, imageDataUrl);
  }

  async changeCurrentUserPassword(
    currentUser: AuthenticatedUser,
    input: ChangePasswordDto
  ): Promise<void> {
    const identity = await this.authRepository.findEmailIdentityByUserId(currentUser.id);

    if (!identity?.passwordHash) {
      throw createInvalidCurrentPasswordException();
    }

    const isPasswordValid = await this.passwordHasherService.verify(
      input.currentPassword,
      identity.passwordHash
    );

    if (!isPasswordValid) {
      throw createInvalidCurrentPasswordException();
    }

    if (input.newPassword === input.currentPassword) {
      throw createPasswordReuseException();
    }

    const nextPasswordHash = await this.passwordHasherService.hash(input.newPassword);

    await this.authRepository.updateEmailIdentity(identity.id, {
      email: identity.providerUserId,
      passwordHash: nextPasswordHash
    });
  }

  buildRecoveryUrl(token: string): string {
    const origins = this.configService.get("CORS_ALLOWED_ORIGINS", { infer: true });
    const base = origins[0]?.replace(/\/$/, "") ?? "http://localhost:3001";
    return `${base}/recover/${token}`;
  }

  createAuthResponse(user: AuthenticatedUser): AuthResponseDto {
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
    avatarUrl: user.avatarUrl,
    displayName: user.displayName,
    email: user.email,
    id: user.id,
    role: user.role === "ADMIN" ? "ADMIN" : "USER",
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

function createInvalidCurrentPasswordException(): Error {
  return createAppException({
    code: AppErrorCode.BadRequest,
    message: "Current password is incorrect",
    statusCode: HttpStatus.BAD_REQUEST
  });
}

function createPasswordReuseException(): Error {
  return createAppException({
    code: AppErrorCode.BadRequest,
    message: "New password must be different from the current password",
    statusCode: HttpStatus.BAD_REQUEST
  });
}

function createInvalidRecoveryTokenException(): Error {
  return createAppException({
    code: AppErrorCode.Unauthorized,
    message: "Invalid or expired recovery link",
    statusCode: HttpStatus.UNAUTHORIZED
  });
}

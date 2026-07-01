import { HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { User } from "#prisma/client";

import { AppErrorCode } from "../../../common/exceptions/app-error-code.js";
import { createAppException } from "../../../common/exceptions/app.exception.js";
import type { AuthenticatedUser } from "../../../common/interfaces/authenticated-request.js";
import type { EnvironmentVariables } from "../../../config/environment.validation.js";
import { PrismaService } from "../../../database/prisma.service.js";
import { UsersService } from "../../users/services/users.service.js";
import { AuthRepository } from "../repositories/auth.repository.js";
import { AuthResponseDto } from "../dto/auth-response.dto.js";
import { ChangePasswordDto } from "../dto/change-password.dto.js";
import { LoginDto } from "../dto/login.dto.js";
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

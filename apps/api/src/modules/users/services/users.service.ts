import { HttpStatus, Injectable } from "@nestjs/common";
import type { Prisma, User, UserRole } from "#prisma/client";

import type { AuthenticatedUser } from "../../../common/interfaces/authenticated-request.js";
import { AppErrorCode } from "../../../common/exceptions/app-error-code.js";
import { createAppException } from "../../../common/exceptions/app.exception.js";
import { UsersRepository } from "../repositories/users.repository.js";

export interface CreateUserWithEmailInput {
  displayName: string;
  email: string;
}

export interface UpdateUserProfileInput {
  displayName: string;
  email: string;
  username: string | null;
}

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async createUserWithEmail(
    input: CreateUserWithEmailInput,
    transaction?: Prisma.TransactionClient
  ): Promise<AuthenticatedUser> {
    const email = normalizeEmail(input.email);
    const existingUser = await this.usersRepository.findByEmail(email);

    if (existingUser) {
      throw createAppException({
        code: AppErrorCode.Conflict,
        message: "User with this email already exists",
        statusCode: HttpStatus.CONFLICT
      });
    }

    try {
      const user = await this.usersRepository.create(
        {
          displayName: input.displayName.trim(),
          email
        },
        transaction
      );

      return toAuthenticatedUser(user);
    } catch (error) {
      if (this.usersRepository.isUniqueConstraintError(error)) {
        throw createAppException({
          code: AppErrorCode.Conflict,
          message: "User with this email already exists",
          statusCode: HttpStatus.CONFLICT
        });
      }

      throw error;
    }
  }

  async createUserProfileForRegistration(
    input: CreateUserWithEmailInput,
    transaction: Prisma.TransactionClient
  ): Promise<AuthenticatedUser> {
    const email = normalizeEmail(input.email);

    try {
      const user = await this.usersRepository.create(
        {
          displayName: input.displayName.trim(),
          email
        },
        transaction
      );

      return toAuthenticatedUser(user);
    } catch (error) {
      if (this.usersRepository.isUniqueConstraintError(error)) {
        throw createAppException({
          code: AppErrorCode.Conflict,
          message: "User with this email already exists",
          statusCode: HttpStatus.CONFLICT
        });
      }

      throw error;
    }
  }

  async ensureEmailAvailable(email: string): Promise<void> {
    const normalizedEmail = normalizeEmail(email);
    const existingUser = await this.usersRepository.findByEmail(normalizedEmail);

    if (existingUser) {
      throw createAppException({
        code: AppErrorCode.Conflict,
        message: "User with this email already exists",
        statusCode: HttpStatus.CONFLICT
      });
    }
  }

  async ensureEmailAvailableForUser(email: string, userId: string): Promise<void> {
    const normalizedEmail = normalizeEmail(email);
    const existingUser = await this.usersRepository.findByEmail(normalizedEmail);

    if (existingUser && existingUser.id !== userId) {
      throw createEmailAlreadyExistsException();
    }
  }

  async ensureUsernameAvailableForUser(username: string | null, userId: string): Promise<void> {
    if (!username) {
      return;
    }

    const existingUser = await this.usersRepository.findByUsername(username);

    if (existingUser && existingUser.id !== userId) {
      throw createUsernameAlreadyExistsException();
    }
  }

  async findAuthenticatedUserById(id: string): Promise<AuthenticatedUser | null> {
    const user = await this.usersRepository.findById(id);

    if (!user || user.status !== "active") {
      return null;
    }

    return toAuthenticatedUser(user);
  }

  async updateUserProfile(
    id: string,
    input: UpdateUserProfileInput,
    transaction: Prisma.TransactionClient
  ): Promise<AuthenticatedUser> {
    try {
      const user = await this.usersRepository.updateProfile(
        id,
        {
          displayName: input.displayName.trim(),
          email: normalizeEmail(input.email),
          username: input.username
        },
        transaction
      );

      return toAuthenticatedUser(user);
    } catch (error) {
      if (this.usersRepository.isUniqueConstraintError(error)) {
        throw createAppException({
          code: AppErrorCode.Conflict,
          message: "Email or username is already taken",
          statusCode: HttpStatus.CONFLICT
        });
      }

      throw error;
    }
  }

  normalizeEmail(email: string): string {
    return normalizeEmail(email);
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function createEmailAlreadyExistsException(): Error {
  return createAppException({
    code: AppErrorCode.Conflict,
    message: "User with this email already exists",
    statusCode: HttpStatus.CONFLICT
  });
}

function createUsernameAlreadyExistsException(): Error {
  return createAppException({
    code: AppErrorCode.Conflict,
    message: "User with this username already exists",
    statusCode: HttpStatus.CONFLICT
  });
}

function toAuthenticatedUser(user: User): AuthenticatedUser {
  return {
    displayName: user.displayName,
    email: user.email,
    id: user.id,
    role: toUserRole(user.role),
    status: user.status,
    username: user.username
  };
}

function toUserRole(role: UserRole): AuthenticatedUser["role"] {
  return role === "ADMIN" ? "ADMIN" : "USER";
}

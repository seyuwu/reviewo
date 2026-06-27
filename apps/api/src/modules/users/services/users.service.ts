import { HttpStatus, Injectable } from "@nestjs/common";
import type { Prisma, User, UserRole } from "@prisma/client";

import type { AuthenticatedUser } from "../../../common/interfaces/authenticated-request.js";
import { AppErrorCode } from "../../../common/exceptions/app-error-code.js";
import { createAppException } from "../../../common/exceptions/app.exception.js";
import { UsersRepository } from "../repositories/users.repository.js";

export interface CreateUserWithEmailInput {
  displayName: string;
  email: string;
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

  async findAuthenticatedUserById(id: string): Promise<AuthenticatedUser | null> {
    const user = await this.usersRepository.findById(id);

    if (!user || user.status !== "active") {
      return null;
    }

    return toAuthenticatedUser(user);
  }

  normalizeEmail(email: string): string {
    return normalizeEmail(email);
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
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

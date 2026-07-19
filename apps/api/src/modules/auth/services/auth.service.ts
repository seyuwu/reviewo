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
import type { CurrentUserDto } from "../dto/current-user.dto.js";
import { LoginDto } from "../dto/login.dto.js";
import { RecoverAccountResponseDto } from "../dto/recover-account-response.dto.js";
import { RegisterDto } from "../dto/register.dto.js";
import { UpdateCurrentUserDto } from "../dto/update-current-user.dto.js";
import { DiscordOauthService } from "./discord-oauth.service.js";
import { JwtTokenService } from "./jwt-token.service.js";
import { PasswordHasherService } from "./password-hasher.service.js";

@Injectable()
export class AuthService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly configService: ConfigService<EnvironmentVariables, true>,
    private readonly discordOauthService: DiscordOauthService,
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

      return await this.createAuthResponse(user);
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
      auth: await this.createAuthResponse(user),
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

    const auth = await this.createAuthResponse(toAuthenticatedUser(existing.user));

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

  async getCurrentUserDto(user: AuthenticatedUser): Promise<CurrentUserDto> {
    const discord = await this.authRepository.findDiscordIdentityByUserId(user.id);

    return {
      avatarUrl: user.avatarUrl,
      discordLinked: Boolean(discord),
      displayName: user.displayName,
      email: user.email,
      id: user.id,
      role: user.role,
      status: user.status,
      username: user.username
    };
  }

  async getDiscordUserId(userId: string): Promise<string | null> {
    const identity = await this.authRepository.findDiscordIdentityByUserId(userId);
    return identity?.providerUserId ?? null;
  }

  isDiscordOauthConfigured(): boolean {
    return this.discordOauthService.isConfigured();
  }

  buildDiscordLinkRedirectUrl(
    currentUser: AuthenticatedUser,
    returnToRaw?: string,
    returnOriginRaw?: string
  ): string {
    if (!this.discordOauthService.isConfigured()) {
      throw createAppException({
        code: AppErrorCode.ServiceUnavailable,
        message: "Discord linking is not configured",
        statusCode: HttpStatus.SERVICE_UNAVAILABLE
      });
    }

    const returnTo = sanitizeReturnTo(returnToRaw);
    const returnOrigin = sanitizeReturnOrigin(
      returnOriginRaw,
      this.configService.get("CORS_ALLOWED_ORIGINS", { infer: true })
    );
    const state = this.jwtTokenService.signDiscordLinkState(currentUser.id, returnTo, returnOrigin);
    return this.discordOauthService.buildAuthorizeUrl(state);
  }

  async completeDiscordLink(code: string, state: string): Promise<string> {
    if (!this.discordOauthService.isConfigured()) {
      throw createAppException({
        code: AppErrorCode.ServiceUnavailable,
        message: "Discord linking is not configured",
        statusCode: HttpStatus.SERVICE_UNAVAILABLE
      });
    }

    const verified = this.jwtTokenService.verifyDiscordLinkState(state);

    if (!verified) {
      throw createAppException({
        code: AppErrorCode.Unauthorized,
        message: "Discord link state is invalid or expired",
        statusCode: HttpStatus.UNAUTHORIZED
      });
    }

    let discordUser: { id: string };

    try {
      discordUser = await this.discordOauthService.exchangeCode(code);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown";
      console.warn(`[discord-oauth] code exchange failed: ${detail}`);
      throw createAppException({
        code: AppErrorCode.BadRequest,
        message: "Could not complete Discord authorization",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    const existingForDiscord = await this.authRepository.findDiscordIdentityByDiscordUserId(
      discordUser.id
    );

    if (existingForDiscord && existingForDiscord.userId !== verified.userId) {
      throw createAppException({
        code: AppErrorCode.Conflict,
        message: "This Discord account is already linked to another user",
        statusCode: HttpStatus.CONFLICT
      });
    }

    const existingForUser = await this.authRepository.findDiscordIdentityByUserId(verified.userId);

    if (existingForUser) {
      if (existingForUser.providerUserId !== discordUser.id) {
        await this.authRepository.deleteDiscordIdentityByUserId(verified.userId);
        await this.authRepository.createDiscordIdentity(verified.userId, discordUser.id);
      }
    } else if (!existingForDiscord) {
      await this.authRepository.createDiscordIdentity(verified.userId, discordUser.id);
    }

    return this.buildWebRedirect(verified.returnTo, verified.returnOrigin, "linked");
  }

  resolveDiscordLinkFailureRedirect(state?: string, reason = "error"): string {
    const verified = state ? this.jwtTokenService.verifyDiscordLinkState(state) : null;
    const returnTo = verified?.returnTo ?? "/";
    const returnOrigin =
      verified?.returnOrigin ??
      this.configService.get("CORS_ALLOWED_ORIGINS", { infer: true })[0] ??
      "http://localhost:3001";

    return this.buildWebRedirect(
      returnTo,
      returnOrigin.replace(/\/$/, ""),
      "error",
      sanitizeDiscordFailureReason(reason)
    );
  }

  async unlinkDiscord(currentUser: AuthenticatedUser): Promise<CurrentUserDto> {
    await this.authRepository.deleteDiscordIdentityByUserId(currentUser.id);
    return this.getCurrentUserDto(currentUser);
  }

  private buildWebRedirect(
    returnTo: string,
    returnOrigin: string,
    discordStatus: "linked" | "error",
    reason?: string
  ): string {
    const url = new URL(sanitizeReturnTo(returnTo), `${returnOrigin.replace(/\/$/, "")}/`);
    url.searchParams.set("discord", discordStatus);
    if (discordStatus === "error" && reason) {
      url.searchParams.set("discordReason", reason.slice(0, 64));
    }
    return url.toString();
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

  async createAuthResponse(user: AuthenticatedUser): Promise<AuthResponseDto> {
    return {
      accessToken: this.jwtTokenService.signAccessToken(user.id),
      expiresIn: this.configService.get("JWT_ACCESS_TOKEN_TTL_SECONDS", { infer: true }),
      tokenType: "Bearer",
      user: await this.getCurrentUserDto(user)
    };
  }
}

function sanitizeReturnTo(returnToRaw?: string): string {
  const fallback = "/";
  if (!returnToRaw) {
    return fallback;
  }

  const trimmed = returnToRaw.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("://")) {
    return fallback;
  }

  return trimmed.slice(0, 512) || fallback;
}

function sanitizeReturnOrigin(returnOriginRaw: string | undefined, allowedOrigins: string[]): string {
  const fallback = allowedOrigins[0]?.replace(/\/$/, "") ?? "http://localhost:3001";
  if (!returnOriginRaw) {
    return fallback;
  }

  try {
    const url = new URL(returnOriginRaw);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return fallback;
    }

    const origin = url.origin;
    const allowed = new Set(allowedOrigins.map((item) => item.replace(/\/$/, "")));

    if (allowed.has(origin) || process.env["NODE_ENV"] === "development") {
      return origin;
    }

    return fallback;
  } catch {
    return fallback;
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

const SAFE_DISCORD_FAILURE_REASONS = new Set([
  "access_denied",
  "denied",
  "error",
  "exchange"
]);

function sanitizeDiscordFailureReason(reason: string): string {
  const normalized = reason.trim().toLowerCase().slice(0, 64);
  return SAFE_DISCORD_FAILURE_REASONS.has(normalized) ? normalized : "error";
}

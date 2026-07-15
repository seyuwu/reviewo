import { Body, Controller, Get, HttpCode, Patch, Post, Req, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../../../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../../../common/interfaces/authenticated-request.js";
import {
  ApiRateLimiterService,
  resolveRequestIp,
  type RequestLike
} from "../../../common/rate-limiting/api-rate-limiter.service.js";
import { AuthResponseDto } from "../dto/auth-response.dto.js";
import { ChangePasswordDto } from "../dto/change-password.dto.js";
import { ClaimEmailDto } from "../dto/claim-email.dto.js";
import { CurrentUserDto } from "../dto/current-user.dto.js";
import { LoginDto } from "../dto/login.dto.js";
import { RecoverAccountDto } from "../dto/recover-account.dto.js";
import { RecoverAccountResponseDto } from "../dto/recover-account-response.dto.js";
import { RegisterDto } from "../dto/register.dto.js";
import { UpdateAvatarDto } from "../dto/update-avatar.dto.js";
import { UpdateCurrentUserDto } from "../dto/update-current-user.dto.js";
import { JwtAuthGuard } from "../guards/jwt-auth.guard.js";
import { AuthService } from "../services/auth.service.js";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly apiRateLimiterService: ApiRateLimiterService,
    private readonly authService: AuthService
  ) {}

  @Post("register")
  async register(
    @Body() input: RegisterDto,
    @Req() request: RequestLike
  ): Promise<AuthResponseDto> {
    await this.apiRateLimiterService.assertWithinLimits([
      {
        key: resolveRequestIp(request),
        limit: 10,
        message: "Too many registration attempts from this network",
        namespace: "auth:register:ip",
        windowSeconds: 60 * 60
      },
      {
        key: input.email.trim().toLowerCase(),
        limit: 3,
        message: "Too many registration attempts for this email",
        namespace: "auth:register:email",
        windowSeconds: 60 * 60
      }
    ]);

    return this.authService.register(input);
  }

  @Post("login")
  async login(@Body() input: LoginDto, @Req() request: RequestLike): Promise<AuthResponseDto> {
    await this.apiRateLimiterService.assertWithinLimits([
      {
        key: resolveRequestIp(request),
        limit: 30,
        message: "Too many login attempts from this network",
        namespace: "auth:login:ip",
        windowSeconds: 15 * 60
      },
      {
        key: input.email.trim().toLowerCase(),
        limit: 10,
        message: "Too many login attempts for this email",
        namespace: "auth:login:email",
        windowSeconds: 15 * 60
      }
    ]);

    return this.authService.login(input);
  }

  @Post("recover")
  async recover(
    @Body() input: RecoverAccountDto,
    @Req() request: RequestLike
  ): Promise<RecoverAccountResponseDto> {
    await this.apiRateLimiterService.assertWithinLimits([
      {
        key: resolveRequestIp(request),
        limit: 30,
        message: "Too many recovery attempts from this network",
        namespace: "auth:recover:ip",
        windowSeconds: 15 * 60
      }
    ]);

    return this.authService.recoverAccount(input.token);
  }

  @Post("claim-email")
  @UseGuards(JwtAuthGuard)
  async claimEmail(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: ClaimEmailDto,
    @Req() request: RequestLike
  ): Promise<CurrentUserDto> {
    await this.apiRateLimiterService.assertWithinLimits([
      {
        key: user.id,
        limit: 10,
        message: "Too many email claim attempts from this account",
        namespace: "auth:claim-email:user",
        windowSeconds: 60 * 60
      },
      {
        key: resolveRequestIp(request),
        limit: 30,
        message: "Too many email claim attempts from this network",
        namespace: "auth:claim-email:ip",
        windowSeconds: 60 * 60
      }
    ]);

    return this.authService.claimEmail(user, input);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  getCurrentUser(@CurrentUser() user: AuthenticatedUser): CurrentUserDto {
    return this.authService.createCurrentUserResponse(user);
  }

  @Patch("me")
  @UseGuards(JwtAuthGuard)
  async updateCurrentUser(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: UpdateCurrentUserDto,
    @Req() request: RequestLike
  ): Promise<CurrentUserDto> {
    await this.apiRateLimiterService.assertWithinLimits([
      {
        key: user.id,
        limit: 20,
        message: "Too many profile update attempts from this account",
        namespace: "auth:profile:update:user",
        windowSeconds: 15 * 60
      },
      {
        key: resolveRequestIp(request),
        limit: 60,
        message: "Too many profile update attempts from this network",
        namespace: "auth:profile:update:ip",
        windowSeconds: 15 * 60
      }
    ]);

    return this.authService.updateCurrentUserProfile(user, input);
  }

  @Post("me/avatar")
  @UseGuards(JwtAuthGuard)
  async updateCurrentUserAvatar(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: UpdateAvatarDto,
    @Req() request: RequestLike
  ): Promise<CurrentUserDto> {
    await this.apiRateLimiterService.assertWithinLimits([
      {
        key: user.id,
        limit: 20,
        message: "Too many avatar update attempts from this account",
        namespace: "auth:avatar:update:user",
        windowSeconds: 15 * 60
      },
      {
        key: resolveRequestIp(request),
        limit: 60,
        message: "Too many avatar update attempts from this network",
        namespace: "auth:avatar:update:ip",
        windowSeconds: 15 * 60
      }
    ]);

    return this.authService.updateCurrentUserAvatar(user, input.imageDataUrl);
  }

  @Post("change-password")
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: ChangePasswordDto,
    @Req() request: RequestLike
  ): Promise<void> {
    await this.apiRateLimiterService.assertWithinLimits([
      {
        key: user.id,
        limit: 10,
        message: "Too many password change attempts from this account",
        namespace: "auth:password:change:user",
        windowSeconds: 60 * 60
      },
      {
        key: resolveRequestIp(request),
        limit: 30,
        message: "Too many password change attempts from this network",
        namespace: "auth:password:change:ip",
        windowSeconds: 60 * 60
      }
    ]);

    return this.authService.changeCurrentUserPassword(user, input);
  }
}

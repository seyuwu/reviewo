import { Body, Controller, Delete, Get, HttpCode, Patch, Post, Query, Req, Res, UseGuards } from "@nestjs/common";

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

    return this.authService.getCurrentUserDto(await this.authService.claimEmail(user, input));
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  async getCurrentUser(@CurrentUser() user: AuthenticatedUser): Promise<CurrentUserDto> {
    return this.authService.getCurrentUserDto(user);
  }

  @Get("discord/link")
  @UseGuards(JwtAuthGuard)
  async getDiscordLinkUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Query("returnTo") returnTo: string | undefined,
    @Query("returnOrigin") returnOrigin: string | undefined,
    @Req() request: RequestLike
  ): Promise<{ url: string }> {
    await this.apiRateLimiterService.assertWithinLimits([
      {
        key: user.id,
        limit: 10,
        message: "Too many Discord link attempts from this account",
        namespace: "auth:discord-link:user",
        windowSeconds: 60 * 60
      },
      {
        key: resolveRequestIp(request),
        limit: 30,
        message: "Too many Discord link attempts from this network",
        namespace: "auth:discord-link:ip",
        windowSeconds: 60 * 60
      }
    ]);

    return {
      url: this.authService.buildDiscordLinkRedirectUrl(user, returnTo, returnOrigin)
    };
  }

  @Get("discord/callback")
  async discordCallback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Query("error") oauthError: string | undefined,
    @Res() response: { redirect: (url: string) => void }
  ): Promise<void> {
    const codeValue = Array.isArray(code) ? code[0] : code;
    const stateValue = Array.isArray(state) ? state[0] : state;
    const oauthErrorValue = Array.isArray(oauthError) ? oauthError[0] : oauthError;

    if (oauthErrorValue || !codeValue || !stateValue) {
      console.warn(
        `[discord-oauth] callback rejected: error=${oauthErrorValue ?? "none"} code=${Boolean(codeValue)} state=${Boolean(stateValue)}`
      );
      response.redirect(
        this.authService.resolveDiscordLinkFailureRedirect(stateValue, oauthErrorValue ?? "denied")
      );
      return;
    }

    try {
      const redirectTo = await this.authService.completeDiscordLink(codeValue, stateValue);
      response.redirect(redirectTo);
    } catch (error) {
      const responseBody =
        error && typeof error === "object" && "getResponse" in error
          ? (error as { getResponse: () => unknown }).getResponse()
          : null;
      const message =
        responseBody &&
        typeof responseBody === "object" &&
        responseBody !== null &&
        "message" in responseBody &&
        typeof (responseBody as { message: unknown }).message === "string"
          ? (responseBody as { message: string }).message
          : error instanceof Error
            ? error.message
            : "unknown";
      console.warn(`[discord-oauth] callback failed: ${message}`);
      response.redirect(this.authService.resolveDiscordLinkFailureRedirect(stateValue, "exchange"));
    }
  }

  @Delete("discord")
  @UseGuards(JwtAuthGuard)
  async unlinkDiscord(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: RequestLike
  ): Promise<CurrentUserDto> {
    await this.apiRateLimiterService.assertWithinLimits([
      {
        key: user.id,
        limit: 10,
        message: "Too many Discord unlink attempts from this account",
        namespace: "auth:discord-unlink:user",
        windowSeconds: 60 * 60
      },
      {
        key: resolveRequestIp(request),
        limit: 30,
        message: "Too many Discord unlink attempts from this network",
        namespace: "auth:discord-unlink:ip",
        windowSeconds: 60 * 60
      }
    ]);

    return this.authService.unlinkDiscord(user);
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

    const updated = await this.authService.updateCurrentUserProfile(user, input);
    return this.authService.getCurrentUserDto(updated);
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

    const updated = await this.authService.updateCurrentUserAvatar(user, input.imageDataUrl);
    return this.authService.getCurrentUserDto(updated);
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

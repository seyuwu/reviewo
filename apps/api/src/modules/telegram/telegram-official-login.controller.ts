import { Body, Controller, Get, Header, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import { IsString, Matches, MaxLength } from "class-validator";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../../common/interfaces/authenticated-request.js";
import {
  ApiRateLimiterService,
  resolveRequestIp,
  type RequestLike
} from "../../common/rate-limiting/api-rate-limiter.service.js";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { TelegramOfficialLoginService } from "./telegram-official-login.service.js";

class CompleteOfficialLoginDto {
  @IsString() @Matches(/^[a-f0-9]{32}$/) requestId!: string;
  @IsString() @Matches(/^[A-Za-z0-9_-]{43}$/) browserToken!: string;
  @IsString()
  @MaxLength(16384)
  @Matches(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
  idToken!: string;
}

@Controller("telegram/official-login")
export class TelegramOfficialLoginController {
  constructor(
    private readonly login: TelegramOfficialLoginService,
    private readonly limiter: ApiRateLimiterService
  ) {}

  @Get("config")
  @Header("Cache-Control", "private, no-store")
  config() {
    return this.login.configuration();
  }

  @Post("request")
  @HttpCode(200)
  @Header("Cache-Control", "private, no-store")
  async request(@Req() request: RequestLike) {
    await this.limit(request, "request");
    return this.login.create("login");
  }

  @Post("complete")
  @HttpCode(200)
  @Header("Cache-Control", "private, no-store")
  async complete(@Body() input: CompleteOfficialLoginDto, @Req() request: RequestLike) {
    await this.limit(request, "complete");
    return this.login.complete(input, "login");
  }

  @Post("link/request")
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  @Header("Cache-Control", "private, no-store")
  async linkRequest(@CurrentUser() user: AuthenticatedUser, @Req() request: RequestLike) {
    await this.limit(request, "link-request", user);
    return this.login.create("link", user);
  }

  @Post("link/complete")
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  @Header("Cache-Control", "private, no-store")
  async linkComplete(
    @Body() input: CompleteOfficialLoginDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: RequestLike
  ) {
    await this.limit(request, "link-complete", user);
    return this.login.complete(input, "link", user);
  }

  private limit(request: RequestLike, action: string, user?: AuthenticatedUser) {
    return this.limiter.assertWithinLimits([
      {
        key: resolveRequestIp(request),
        namespace: `telegram:official:${action}:ip`,
        limit: 60,
        windowSeconds: 900,
        message: "Too many Telegram authorization attempts"
      },
      ...(user
        ? [
            {
              key: user.id,
              namespace: `telegram:official:${action}:user`,
              limit: 30,
              windowSeconds: 900,
              message: "Too many Telegram authorization attempts"
            }
          ]
        : [])
    ]);
  }
}

import { Body, Controller, Header, Headers, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import { IsString, Matches } from "class-validator";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../../common/interfaces/authenticated-request.js";
import { ApiRateLimiterService, resolveRequestIp, type RequestLike } from "../../common/rate-limiting/api-rate-limiter.service.js";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { TelegramBotService } from "./telegram-bot.service.js";
import { TelegramBrowserLoginService } from "./telegram-browser-login.service.js";

class BrowserLoginRequestDto {
  @IsString() @Matches(/^[a-f0-9]{32}$/) requestId!: string;
}
class BrowserLoginPollDto extends BrowserLoginRequestDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]{43}$/) pollToken!: string;
}
class BrowserLoginConfirmDto extends BrowserLoginRequestDto {
  @IsString() @Matches(/^\d{1,32}$/) telegramUserId!: string;
  @IsString() @Matches(/^\d{6}$/) verificationCode!: string;
}

@Controller("telegram/browser-login")
export class TelegramBrowserLoginController {
  constructor(private readonly login: TelegramBrowserLoginService,
    private readonly bot: TelegramBotService, private readonly limiter: ApiRateLimiterService) {}

  @Post() @HttpCode(200) @Header("Cache-Control", "private, no-store")
  async create(@Req() request: RequestLike) {
    await this.limiter.assertWithinLimits([{ key: resolveRequestIp(request), namespace: "telegram:browser-login:create",
      limit: 30, windowSeconds: 900, message: "Too many Telegram login requests" }]);
    return this.login.create();
  }

  @Post("poll") @HttpCode(200) @Header("Cache-Control", "private, no-store")
  async poll(@Body() input: BrowserLoginPollDto, @Req() request: RequestLike) {
    await this.limiter.assertWithinLimits([{ key: resolveRequestIp(request), namespace: "telegram:browser-login:poll",
      limit: 120, windowSeconds: 60, message: "Too many Telegram login checks" }]);
    return this.login.poll(input.requestId, input.pollToken);
  }

  @Post("preview") @HttpCode(200) @UseGuards(JwtAuthGuard) @Header("Cache-Control", "private, no-store")
  preview(@Body() input: BrowserLoginRequestDto, @Headers("x-telegram-bot-secret") secret?: string) {
    this.bot.assertBotSecret(secret);
    return this.login.preview(input.requestId);
  }

  @Post("confirm") @HttpCode(200) @UseGuards(JwtAuthGuard) @Header("Cache-Control", "private, no-store")
  async confirm(@Body() input: BrowserLoginConfirmDto, @CurrentUser() user: AuthenticatedUser,
    @Headers("x-telegram-bot-secret") secret?: string) {
    this.bot.assertBotSecret(secret);
    await this.limiter.assertWithinLimits([{ key: user.id, namespace: "telegram:browser-login:confirm",
      limit: 30, windowSeconds: 300, message: "Too many Telegram login confirmations" },
    { key: input.requestId, namespace: "telegram:browser-login:confirm:request",
      limit: 5, windowSeconds: 300, message: "Too many attempts for this Telegram login request" }]);
    return this.login.confirm(input.requestId, input.telegramUserId, input.verificationCode, user);
  }
}

import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
  UseGuards
} from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import { IsBoolean, IsOptional, IsString, Matches, MaxLength } from "class-validator";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../../common/interfaces/authenticated-request.js";
import {
  ApiRateLimiterService,
  resolveRequestIp,
  type RequestLike
} from "../../common/rate-limiting/api-rate-limiter.service.js";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";

import { TelegramBotService } from "./telegram-bot.service.js";

class TelegramLoginDto {
  @IsString()
  @Matches(/^\d{1,20}$/)
  id!: string;

  @IsString()
  @Matches(/^\d{10}$/)
  auth_date!: string;

  @IsString()
  @Matches(/^[a-f\d]{64}$/i)
  hash!: string;

  @IsString()
  @MaxLength(128)
  first_name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  last_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  photo_url?: string;
}

class CompleteTelegramLinkDto {
  @IsString()
  @Matches(/^\d{8}$/)
  code!: string;

  @IsString()
  @Matches(/^\d{1,32}$/)
  telegramUserId!: string;
}

class EnsureTelegramLinkDto {
  @IsString()
  @Matches(/^\d{1,32}$/)
  telegramUserId!: string;
}

class NotificationDeliveryDto {
  @IsString()
  @Matches(/^[0-9a-f-]{36}$/i)
  id!: string;

  @IsBoolean()
  delivered!: boolean;

  @IsString()
  @Matches(/^\d{1,32}$/)
  telegramUserId!: string;
}

class TelegramWebAccessTicketDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  ticket!: string;
}

@Controller("telegram")
export class TelegramBotController {
  constructor(
    private readonly apiRateLimiterService: ApiRateLimiterService,
    private readonly telegramBotService: TelegramBotService
  ) {}

  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(@Body() input: TelegramLoginDto, @Req() request: RequestLike): Promise<unknown> {
    await this.apiRateLimiterService.assertWithinLimits([
      {
        key: resolveRequestIp(request),
        limit: 30,
        message: "Too many Telegram login attempts",
        namespace: "telegram:login:ip",
        windowSeconds: 15 * 60
      }
    ]);
    return this.telegramBotService.loginFromTelegram(input);
  }

  @Post("web-access-ticket")
  @UseGuards(JwtAuthGuard)
  createWebAccessTicket(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: RequestLike
  ) {
    return this.apiRateLimiterService
      .assertWithinLimits([
        {
          key: currentUser.id,
          limit: 30,
          message: "Too many Telegram web access links",
          namespace: "telegram:web-access-ticket:user",
          windowSeconds: 15 * 60
        },
        {
          key: resolveRequestIp(request),
          limit: 60,
          message: "Too many Telegram web access links",
          namespace: "telegram:web-access-ticket:ip",
          windowSeconds: 15 * 60
        }
      ])
      .then(() => this.telegramBotService.createWebAccessTicket(currentUser.id));
  }

  @Post("web-access-ticket/exchange")
  @HttpCode(HttpStatus.OK)
  exchangeWebAccessTicket(@Body() input: TelegramWebAccessTicketDto, @Req() request: RequestLike) {
    return this.apiRateLimiterService
      .assertWithinLimits([
        {
          key: resolveRequestIp(request),
          limit: 30,
          message: "Too many Telegram web access attempts",
          namespace: "telegram:web-access-exchange:ip",
          windowSeconds: 15 * 60
        }
      ])
      .then(() => this.telegramBotService.exchangeWebAccessTicket(input.ticket));
  }

  @Post("link")
  @HttpCode(HttpStatus.OK)
  completeLink(
    @Body() input: CompleteTelegramLinkDto,
    @Req() request: RequestLike,
    @Headers("x-telegram-bot-secret") secret?: string
  ): Promise<unknown> {
    this.assertBotSecret(secret);
    return this.apiRateLimiterService
      .assertWithinLimits([
        {
          key: input.telegramUserId,
          limit: 10,
          message: "Too many Telegram link attempts",
          namespace: "telegram:link:user",
          windowSeconds: 60 * 60
        },
        {
          key: resolveRequestIp(request),
          limit: 100,
          message: "Too many Telegram link attempts from this network",
          namespace: "telegram:link:ip",
          windowSeconds: 60 * 60
        }
      ])
      .then(() => this.telegramBotService.completeLink(input.code, input.telegramUserId));
  }

  @Post("ensure-link")
  @UseGuards(JwtAuthGuard)
  async ensureTelegramLink(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() input: EnsureTelegramLinkDto,
    @Headers("x-telegram-bot-secret") secret?: string
  ): Promise<{ linked: true }> {
    this.assertBotSecret(secret);
    await this.apiRateLimiterService.assertWithinLimits([
      {
        key: currentUser.id,
        limit: 30,
        message: "Too many Telegram link checks",
        namespace: "telegram:ensure-link:user",
        windowSeconds: 60 * 60
      }
    ]);
    return this.telegramBotService.ensureTelegramIdentity(currentUser.id, input.telegramUserId);
  }

  @Get("notifications")
  listNotifications(@Headers("x-telegram-bot-secret") secret?: string) {
    this.assertBotSecret(secret);
    return this.telegramBotService.listNotifications();
  }

  @Post("notifications/delivery")
  @HttpCode(HttpStatus.NO_CONTENT)
  async recordDelivery(
    @Body() input: NotificationDeliveryDto,
    @Headers("x-telegram-bot-secret") secret?: string
  ): Promise<void> {
    this.assertBotSecret(secret);
    await this.telegramBotService.recordDelivery(input.id, input.telegramUserId, input.delivered);
  }

  private assertBotSecret(provided?: string): void {
    const expected = this.telegramBotService.getBotSecret();
    if (!expected) {
      throw new UnauthorizedException();
    }

    const left = Buffer.from(provided ?? "");
    const right = Buffer.from(expected);
    if (left.length !== right.length || !timingSafeEqual(left, right)) {
      throw new UnauthorizedException();
    }
  }
}

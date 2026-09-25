import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException
} from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import { IsBoolean, IsString, Matches } from "class-validator";
import {
  ApiRateLimiterService,
  resolveRequestIp,
  type RequestLike
} from "../../common/rate-limiting/api-rate-limiter.service.js";

import { TelegramBotService } from "./telegram-bot.service.js";

class CompleteTelegramLinkDto {
  @IsString()
  @Matches(/^\d{8}$/)
  code!: string;

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

@Controller("telegram")
export class TelegramBotController {
  constructor(
    private readonly apiRateLimiterService: ApiRateLimiterService,
    private readonly telegramBotService: TelegramBotService
  ) {}

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

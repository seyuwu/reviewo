import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Post,
  Req,
  UseGuards
} from "@nestjs/common";
import { IsOptional, IsString, Matches } from "class-validator";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../../common/interfaces/authenticated-request.js";
import {
  ApiRateLimiterService,
  resolveRequestIp,
  type RequestLike
} from "../../common/rate-limiting/api-rate-limiter.service.js";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { TelegramBotService } from "./telegram-bot.service.js";
import { TelegramTournamentBotService } from "./telegram-tournament-bot.service.js";

class LinkRequestDto {
  @IsString()
  @Matches(/^[a-f0-9]{32}$/)
  requestId!: string;
}

class ConfirmLinkDto extends LinkRequestDto {
  @IsString()
  @Matches(/^\d{1,32}$/)
  telegramUserId!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9_]{1,32}$/)
  telegramUsername?: string | null;
}

class BotSessionDto {
  @IsString()
  @Matches(/^\d{1,32}$/)
  telegramUserId!: string;
}

class BotStartedDto {
  @IsString()
  @Matches(/^\d{1,32}$/)
  telegramUserId!: string;
}

@Controller("telegram")
export class TelegramTournamentBotController {
  constructor(
    private readonly onboarding: TelegramTournamentBotService,
    private readonly bot: TelegramBotService,
    private readonly limiter: ApiRateLimiterService
  ) {}

  @Get("tournament-bot-link/status")
  @UseGuards(JwtAuthGuard)
  @Header("Cache-Control", "private, no-store")
  async status(@CurrentUser() user: AuthenticatedUser, @Req() request: RequestLike) {
    await this.limiter.assertWithinLimits([
      {
        key: user.id,
        namespace: "telegram:tournament-bot-link:status:user",
        limit: 120,
        windowSeconds: 60,
        message: "Too many Telegram bot status checks"
      },
      {
        key: resolveRequestIp(request),
        namespace: "telegram:tournament-bot-link:status:ip",
        limit: 240,
        windowSeconds: 60,
        message: "Too many Telegram bot status checks"
      }
    ]);
    return {
      ...(await this.onboarding.status(user.id)),
      canAccessTournamentsWithoutTelegram: user.role === "ADMIN"
    };
  }

  @Post("tournament-bot-link")
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  @Header("Cache-Control", "private, no-store")
  async create(@CurrentUser() user: AuthenticatedUser, @Req() request: RequestLike) {
    await this.limiter.assertWithinLimits([
      {
        key: user.id,
        namespace: "telegram:tournament-bot-link:create:user",
        limit: 10,
        windowSeconds: 900,
        message: "Too many Telegram link requests"
      },
      {
        key: resolveRequestIp(request),
        namespace: "telegram:tournament-bot-link:create:ip",
        limit: 30,
        windowSeconds: 900,
        message: "Too many Telegram link requests"
      }
    ]);
    return this.onboarding.createLinkRequest(user);
  }

  @Post("tournament-bot-link/poll")
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  @Header("Cache-Control", "private, no-store")
  async poll(
    @Body() input: LinkRequestDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: RequestLike
  ) {
    await this.limiter.assertWithinLimits([
      {
        key: user.id,
        namespace: "telegram:tournament-bot-link:poll:user",
        limit: 120,
        windowSeconds: 60,
        message: "Too many Telegram link checks"
      },
      {
        key: resolveRequestIp(request),
        namespace: "telegram:tournament-bot-link:poll:ip",
        limit: 240,
        windowSeconds: 60,
        message: "Too many Telegram link checks"
      }
    ]);
    return this.onboarding.poll(input.requestId, user.id);
  }

  @Post("tournament-bot-link/preview")
  @HttpCode(200)
  @Header("Cache-Control", "private, no-store")
  preview(@Body() input: LinkRequestDto, @Headers("x-telegram-bot-secret") secret?: string) {
    this.bot.assertBotSecret(secret);
    return this.onboarding.preview(input.requestId);
  }

  @Post("tournament-bot-link/confirm")
  @HttpCode(200)
  @Header("Cache-Control", "private, no-store")
  async confirm(@Body() input: ConfirmLinkDto, @Headers("x-telegram-bot-secret") secret?: string) {
    this.bot.assertBotSecret(secret);
    await this.limiter.assertWithinLimits([
      {
        key: input.telegramUserId,
        namespace: "telegram:tournament-bot-link:confirm:user",
        limit: 20,
        windowSeconds: 900,
        message: "Too many Telegram link confirmations"
      },
      {
        key: input.requestId,
        namespace: "telegram:tournament-bot-link:confirm:request",
        limit: 5,
        windowSeconds: 300,
        message: "Too many attempts for this Telegram link request"
      }
    ]);
    return this.onboarding.confirm(input.requestId, input.telegramUserId, input.telegramUsername);
  }

  @Post("tournament-bot-started")
  @HttpCode(200)
  @Header("Cache-Control", "private, no-store")
  async recordBotStarted(
    @Body() input: BotStartedDto,
    @Req() request: RequestLike,
    @Headers("x-telegram-bot-secret") secret?: string
  ) {
    this.bot.assertBotSecret(secret);
    await this.limiter.assertWithinLimits([
      {
        key: input.telegramUserId,
        namespace: "telegram:tournament-bot-started:user",
        limit: 120,
        windowSeconds: 60,
        message: "Too many Telegram bot start events"
      },
      {
        key: resolveRequestIp(request),
        namespace: "telegram:tournament-bot-started:ip",
        limit: 1200,
        windowSeconds: 60,
        message: "Too many Telegram bot start events"
      }
    ]);
    await this.onboarding.recordBotStarted(input.telegramUserId);
    return { recorded: true as const };
  }

  @Post("bot-session")
  @HttpCode(200)
  @Header("Cache-Control", "private, no-store")
  async createBotSession(
    @Body() input: BotSessionDto,
    @Req() request: RequestLike,
    @Headers("x-telegram-bot-secret") secret?: string
  ) {
    this.bot.assertBotSecret(secret);
    await this.limiter.assertWithinLimits([
      {
        key: input.telegramUserId,
        namespace: "telegram:bot-session:user",
        limit: 20,
        windowSeconds: 900,
        message: "Too many Telegram bot sessions"
      },
      {
        key: resolveRequestIp(request),
        namespace: "telegram:bot-session:ip",
        limit: 60,
        windowSeconds: 900,
        message: "Too many Telegram bot sessions"
      }
    ]);
    return this.onboarding.loginBotSession(input.telegramUserId);
  }
}

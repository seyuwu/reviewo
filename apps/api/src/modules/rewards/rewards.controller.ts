import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../../common/interfaces/authenticated-request.js";
import {
  ApiRateLimiterService,
  resolveRequestIp,
  type RequestLike
} from "../../common/rate-limiting/api-rate-limiter.service.js";
import { AdminGuard } from "../auth/guards/admin.guard.js";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { TelegramBotService } from "../telegram/telegram-bot.service.js";
import {
  GiveawayDto,
  PurchaseDto,
  RewardSettingsDto,
  RewardNoticeDeliveryDto,
  ReviewTagDto,
  SyncRewardsDto,
  TagDto
} from "./rewards.dto.js";
import { RewardsService } from "./rewards.service.js";
import { RewardVerificationService } from "./rewards.verification.js";

function page(value: string | undefined, max = 100000) {
  if (value === undefined) return 0;
  if (!/^\d{1,6}$/.test(value) || Number(value) > max)
    throw new BadRequestException("Некорректная страница");
  return Number(value);
}

@Controller("telegram/rewards")
export class BotRewardsController {
  constructor(
    private readonly rewards: RewardsService,
    private readonly bot: TelegramBotService,
    private readonly limiter: ApiRateLimiterService
  ) {}
  @Get("config")
  @Header("Cache-Control", "private, no-store")
  async config(@Headers("x-telegram-bot-secret") secret?: string) {
    this.bot.assertBotSecret(secret);
    const p = await this.rewards.program();
    return {
      enabled: p.enabled,
      startedAt: p.startedAt,
      settings: p.settings,
      notices: p.enabled ? await this.rewards.claimNotices() : []
    };
  }
  @Post("sync")
  @HttpCode(200)
  async sync(
    @Body() input: SyncRewardsDto,
    @Req() request: RequestLike,
    @Headers("x-telegram-bot-secret") secret?: string
  ) {
    this.bot.assertBotSecret(secret);
    await this.limiter.assertWithinLimits([
      {
        key: resolveRequestIp(request),
        namespace: "rewards:sync",
        limit: 600,
        windowSeconds: 3600,
        message: "Too many reward batches"
      }
    ]);
    return this.rewards.ingest(input.events);
  }
  @Post("notices/:id")
  @HttpCode(200)
  async notice(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: RewardNoticeDeliveryDto,
    @Headers("x-telegram-bot-secret") secret?: string
  ) {
    this.bot.assertBotSecret(secret);
    return this.rewards.noticeDelivery(id, input.delivered);
  }
}
@Controller("rewards")
@UseGuards(JwtAuthGuard)
export class RewardsController {
  constructor(
    private readonly rewards: RewardsService,
    private readonly checks: RewardVerificationService,
    private readonly limiter: ApiRateLimiterService
  ) {}
  @Get("me")
  @Header("Cache-Control", "private, no-store")
  async me(@CurrentUser() user: AuthenticatedUser, @Query("offset") offset?: string) {
    return this.rewards.walletPage(
      await this.rewards.telegramForUser(user.id),
      page(offset, 10000)
    );
  }
  @Get("giveaways/:id")
  @Header("Cache-Control", "private, no-store")
  async giveaway(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.rewards.giveawayPage(id, await this.rewards.telegramForUser(user.id));
  }
  @Post("giveaways/:id/tickets")
  @HttpCode(200)
  async buy(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: PurchaseDto
  ) {
    await this.limit(user.id, "purchase", 60);
    return this.rewards.purchase(id, await this.rewards.telegramForUser(user.id), input);
  }
  @Post("tags")
  @HttpCode(200)
  async tag(@CurrentUser() user: AuthenticatedUser, @Body() input: TagDto) {
    await this.limit(user.id, "tag", 12);
    return this.checks.enroll(
      await this.rewards.telegramForUser(user.id),
      input.provider,
      input.relink ?? false
    );
  }
  private limit(key: string, action: string, limit: number) {
    return this.limiter.assertWithinLimits([
      {
        key,
        namespace: `rewards:${action}`,
        limit,
        windowSeconds: 3600,
        message: "Слишком много запросов, попробуйте позже"
      }
    ]);
  }
}
@Controller("rewards/steam")
export class RewardSteamController {
  constructor(
    private readonly checks: RewardVerificationService,
    private readonly limiter: ApiRateLimiterService
  ) {}
  @Get("callback")
  @Header("Content-Type", "text/html; charset=utf-8")
  @Header("Cache-Control", "no-store")
  @Header("Referrer-Policy", "no-referrer")
  async callback(@Query() query: Record<string, unknown>, @Req() request: RequestLike) {
    await this.limiter.assertWithinLimits([
      {
        key: resolveRequestIp(request),
        namespace: "rewards:steam-callback",
        limit: 30,
        windowSeconds: 3600,
        message: "Too many Steam callbacks"
      }
    ]);
    if (
      Object.keys(query).length > 24 ||
      Object.values(query).some((value) => typeof value !== "string" || value.length > 2048)
    )
      throw new BadRequestException("Некорректный ответ Steam");
    await this.checks.steamCallback(query as Record<string, string>);
    return '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Steam подключён</title><body><h1>Steam подключён</h1><p>Вернитесь в бот. Тег в имени будет проверяться автоматически.</p><a href="https://t.me/FDPdotabot">Открыть FDP</a></body></html>';
  }
}
@Controller("admin/rewards")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminRewardsController {
  constructor(private readonly rewards: RewardsService) {}
  @Get() @Header("Cache-Control", "private, no-store") page() {
    return this.rewards.adminPage();
  }
  @Post("settings") settings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: RewardSettingsDto
  ) {
    return this.rewards.settings(input, user.id);
  }
  @Post("giveaways") create(@CurrentUser() user: AuthenticatedUser, @Body() input: GiveawayDto) {
    return this.rewards.createGiveaway(input, user.id);
  }
  @Post("giveaways/:id/edit")
  edit(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: GiveawayDto
  ) {
    return this.rewards.editGiveaway(id, input, user.id);
  }
  @Post("verifications/:id")
  review(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: ReviewTagDto
  ) {
    return this.rewards.reviewTag(
      id,
      input.approved,
      input.reason,
      input.profileId ?? null,
      user.id
    );
  }
  @Get("giveaways/:id/tickets") tickets(
    @Param("id", ParseUUIDPipe) id: string,
    @Query("after") after?: string
  ) {
    return this.rewards.tickets(id, page(after));
  }
  @Post("giveaways/:id/delivery/:number") delivery(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("number") number: string
  ) {
    const value = page(number);
    if (!value) throw new BadRequestException("Invalid ticket");
    return this.rewards.delivery(id, value, user.id);
  }
  @Post("giveaways/:id/:action") action(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("action") action: string
  ) {
    if (!["publish", "close", "draw", "cancel"].includes(action))
      throw new BadRequestException("Неизвестное действие");
    return this.rewards.action(id, action as "publish" | "close" | "draw" | "cancel", user.id);
  }
}

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
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { TelegramBotService } from "../telegram/telegram-bot.service.js";
import {
  GiveawayDto,
  PurchaseDto,
  RewardSettingsDto,
  RewardNoticeDeliveryDto,
  ReviewTagDto,
  RewardTaskDto,
  RewardSubmissionDto,
  ReviewSubmissionDto,
  SyncRewardsDto,
  TagDto
} from "./rewards.dto.js";
import { RewardsService } from "./rewards.service.js";
import { RewardVerificationService } from "./rewards.verification.js";
import { RewardsAccessService, RewardsAdminGuard } from "./rewards-access.service.js";
import { RewardsTasksService } from "./rewards-tasks.service.js";

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
    private readonly limiter: ApiRateLimiterService,
    private readonly access: RewardsAccessService,
    private readonly tasks: RewardsTasksService
  ) {}
  @Get("access")
  @Header("Cache-Control", "private, no-store")
  async accessInfo(@CurrentUser() user: AuthenticatedUser) {
    return { canManage: await this.access.canManage(user) };
  }
  @Post("tasks/:key/submissions")
  @HttpCode(200)
  async submitTask(
    @CurrentUser() user: AuthenticatedUser,
    @Param("key") key: string,
    @Body() input: RewardSubmissionDto
  ) {
    await this.limit(user.id, "submission", 30);
    return this.tasks.submit(key, await this.rewards.telegramForUser(user.id), input.evidence);
  }
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
    return this.checks.enroll(await this.rewards.telegramForUser(user.id), input.provider);
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
@Controller("admin/rewards")
@UseGuards(JwtAuthGuard, RewardsAdminGuard)
export class AdminRewardsController {
  constructor(
    private readonly rewards: RewardsService,
    private readonly tasks: RewardsTasksService
  ) {}
  @Get("analytics")
  @Header("Cache-Control", "private, no-store")
  analytics(
    @Query("task") task?: string,
    @Query("telegramId") telegramId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("offset") offset?: string
  ) {
    return this.tasks.analytics({ task, telegramId, from, to, offset: page(offset, 10000) });
  }
  @Post("tasks") createTask(@CurrentUser() user: AuthenticatedUser, @Body() input: RewardTaskDto) {
    return this.tasks.save(null, input, user.id);
  }
  @Post("tasks/:key") editTask(
    @CurrentUser() user: AuthenticatedUser,
    @Param("key") key: string,
    @Body() input: RewardTaskDto
  ) {
    return this.tasks.save(key, input, user.id);
  }
  @Post("tasks/:key/:action") taskAction(
    @CurrentUser() user: AuthenticatedUser,
    @Param("key") key: string,
    @Param("action") action: string
  ) {
    if (!["archive", "restore"].includes(action))
      throw new BadRequestException("Неизвестное действие");
    return this.tasks.archive(key, user.id, action === "restore");
  }
  @Get("submissions")
  @Header("Cache-Control", "private, no-store")
  submissions(
    @Query("task") task?: string,
    @Query("status") status?: string,
    @Query("offset") offset?: string
  ) {
    return this.tasks.submissions(task, status ?? "PENDING", page(offset, 10000));
  }
  @Post("submissions/:id") reviewSubmission(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: ReviewSubmissionDto
  ) {
    return this.tasks.review(id, input.approved, input.reason, user.id);
  }
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

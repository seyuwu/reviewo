import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { AdminGuard } from "../auth/guards/admin.guard.js";
import { TelegramBotService } from "../telegram/telegram-bot.service.js";
import {
  ApiRateLimiterService,
  resolveRequestIp,
  type RequestLike
} from "../../common/rate-limiting/api-rate-limiter.service.js";
import { ReferralRangeDto, SyncBotReferralsDto } from "./referrals.dto.js";
import { ReferralsService } from "./referrals.service.js";

@Controller("telegram/referrals")
export class BotReferralsController {
  constructor(
    private readonly service: ReferralsService,
    private readonly bot: TelegramBotService,
    private readonly limiter: ApiRateLimiterService
  ) {}

  @Post("sync")
  @HttpCode(200)
  async sync(
    @Body() input: SyncBotReferralsDto,
    @Req() request: RequestLike,
    @Headers("x-telegram-bot-secret") secret?: string
  ) {
    this.bot.assertBotSecret(secret);
    await this.limiter.assertWithinLimits([
      {
        key: resolveRequestIp(request),
        limit: 720,
        namespace: "telegram:referrals:sync",
        windowSeconds: 3600,
        message: "Too many referral sync batches"
      }
    ]);
    return this.service.sync(input.events);
  }
}

@Controller("admin/analytics/referrals")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminReferralsController {
  constructor(private readonly service: ReferralsService) {}
  @Get()
  @Header("Cache-Control", "private, no-store")
  leaderboard(@Query() input: ReferralRangeDto) {
    return this.service.leaderboard(input);
  }
  @Get(":inviterTelegramId")
  @Header("Cache-Control", "private, no-store")
  invitees(@Param("inviterTelegramId") id: string, @Query() input: ReferralRangeDto) {
    if (!/^[1-9]\d{0,19}$/.test(id)) throw new BadRequestException("Invalid inviter");
    return this.service.invitees(id, input);
  }
}

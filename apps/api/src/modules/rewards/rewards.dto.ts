import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsDefined,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested
} from "class-validator";

export class RewardEventDto {
  @IsString() @Matches(/^[A-Za-z0-9:_-]{1,200}$/) id!: string;
  @IsString() @Matches(/^[1-9]\d{0,19}$/) telegramId!: string;
  @IsIn(["account_ready", "search_started", "party_created", "party_joined", "search_result"])
  kind!: string;
  @IsDateString({ strict: true }) occurredAt!: string;
}
export class SyncRewardsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => RewardEventDto)
  events!: RewardEventDto[];
}
export class PurchaseDto {
  @IsUUID() requestId!: string;
  @IsInt() @Min(1) @Max(1000) quantity!: number;
  @IsInt() @Min(1) @Max(100000) expectedPrice!: number;
}
export class GiveawayDto {
  @IsString() @MaxLength(100) title!: string;
  @IsString() @MaxLength(2000) description!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  prizes!: string[];
  @IsInt() @Min(1) @Max(100000) ticketPrice!: number;
  @IsInt() @Min(1) @Max(1000) maxTickets!: number;
  @IsBoolean() uniqueWinners!: boolean;
  @IsDateString({ strict: true }) startsAt!: string;
  @IsDateString({ strict: true }) endsAt!: string;
}
export class TagDto {
  @IsIn(["telegram", "steam"]) provider!: "telegram" | "steam";
  @IsOptional() @IsBoolean() relink?: boolean;
}
export class TaskSettingDto {
  @IsIn([
    "profile_ready",
    "daily_party",
    "referral_ready",
    "referral_active",
    "first_party_join",
    "weekly_party",
    "telegram_tag",
    "steam_tag"
  ])
  key!: string;
  @IsString() @MaxLength(100) title!: string;
  @IsInt() @Min(1) @Max(10000) amount!: number;
  @IsBoolean() enabled!: boolean;
}
export class PhraseSettingsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(180, { each: true })
  home!: string[];
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(180, { each: true })
  earn!: string[];
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(180, { each: true })
  raffle!: string[];
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(180, { each: true })
  history!: string[];
}
export class RewardSettingsDto {
  @IsBoolean() enabled!: boolean;
  @IsString() @MaxLength(50) programName!: string;
  @IsString() @MaxLength(30) mascotName!: string;
  @IsString() @MaxLength(24) currencyName!: string;
  @IsString() @Matches(/^@[A-Za-z0-9_]{5,32}$/) tag!: string;
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => TaskSettingDto)
  tasks!: TaskSettingDto[];
  @IsDefined() @ValidateNested() @Type(() => PhraseSettingsDto) phrases!: PhraseSettingsDto;
}
export class ReviewTagDto {
  @IsBoolean() approved!: boolean;
  @IsString() @MaxLength(500) reason!: string;
  @IsOptional() @IsString() @MaxLength(40) profileId?: string | null;
}
export class RewardNoticeDeliveryDto {
  @IsBoolean() delivered!: boolean;
}

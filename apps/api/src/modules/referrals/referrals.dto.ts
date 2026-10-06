import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested
} from "class-validator";

export class BotReferralEventDto {
  @IsString() @Matches(/^[1-9]\d{0,19}$/) inviterTelegramId!: string;
  @IsString() @Matches(/^[1-9]\d{0,19}$/) inviteeTelegramId!: string;
  @IsString() @Matches(/^[a-f0-9]{24}$/) code!: string;
  @IsString() @MaxLength(128) inviterName!: string;
  @IsString() @MaxLength(128) inviteeName!: string;
  @IsOptional() @IsString() @Matches(/^[A-Za-z0-9_]{1,32}$/) inviterUsername?: string | null;
  @IsOptional() @IsString() @Matches(/^[A-Za-z0-9_]{1,32}$/) inviteeUsername?: string | null;
  @IsDateString({ strict: true }) startedAt!: string;
  @IsOptional() @IsDateString({ strict: true }) accountCreatedAt?: string | null;
  @IsOptional() @IsDateString({ strict: true }) accountReadyAt?: string | null;
  @IsOptional() @IsDateString({ strict: true }) searchStartedAt?: string | null;
  @IsOptional() @IsDateString({ strict: true }) partyJoinedAt?: string | null;
}

export class SyncBotReferralsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => BotReferralEventDto)
  events!: BotReferralEventDto[];
}

export class ReferralRangeDto {
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) from!: string;
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) to!: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  offset?: number;
}

import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from "class-validator";

import { ENTITY_CHAT_LOCALES, type EntityChatLocale } from "@reviewo/shared";

export class SendEntityChatMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message!: string;

  @IsOptional()
  @IsIn(ENTITY_CHAT_LOCALES)
  locale?: EntityChatLocale;
}

export class ListEntityChatMessagesQueryDto {
  @IsOptional()
  @IsUUID("4")
  before?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsIn(ENTITY_CHAT_LOCALES)
  locale?: EntityChatLocale;
}

export class ActiveNowQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}

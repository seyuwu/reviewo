import { IsIn, IsOptional } from "class-validator";

import { ENTITY_CHAT_LOCALES, type EntityChatLocale } from "@reviewo/shared";

export class EntityChatLocaleQueryDto {
  @IsOptional()
  @IsIn(ENTITY_CHAT_LOCALES)
  locale?: EntityChatLocale;
}

import { Transform } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsOptional, IsString, IsUUID } from "class-validator";

import { DOTA_FLAG_LIMIT_PER_SIDE } from "@reviewo/shared";

export class ConfirmDotaQualitiesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(DOTA_FLAG_LIMIT_PER_SIDE * 2)
  @IsString({ each: true })
  qualityKeys!: string[];

  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsUUID("4")
  visitorId?: string;
}

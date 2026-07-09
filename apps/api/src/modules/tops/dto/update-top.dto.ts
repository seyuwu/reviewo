import { Transform } from "class-transformer";
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";
import { TopRankMode, TopSystemSortKey } from "#prisma/client";

export class UpdateTopDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsUUID("4")
  categoryId?: string | null;

  @IsOptional()
  @IsEnum(TopRankMode)
  rankMode?: TopRankMode;

  @IsOptional()
  @IsEnum(TopSystemSortKey)
  systemSortKey?: TopSystemSortKey | null;
}

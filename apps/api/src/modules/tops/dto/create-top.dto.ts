import { Transform } from "class-transformer";
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength
} from "class-validator";
import { TopRankMode, TopSystemSortKey } from "#prisma/client";

export class CreateTopDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsNotEmpty()
  @IsUUID("4")
  categoryId!: string;

  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: "slug must contain lowercase letters, numbers, and hyphens only"
  })
  slug!: string;

  @IsOptional()
  @IsEnum(TopRankMode)
  rankMode?: TopRankMode;

  @IsOptional()
  @IsEnum(TopSystemSortKey)
  systemSortKey?: TopSystemSortKey;
}

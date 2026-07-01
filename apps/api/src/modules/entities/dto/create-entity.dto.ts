import { EntityType } from "#prisma/client";
import { Transform } from "class-transformer";
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  MaxLength,
  MinLength
} from "class-validator";

export class CreateEntityDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsUrl({ protocols: ["http", "https"], require_protocol: true })
  @MaxLength(2048)
  canonicalUrl?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsUUID("4")
  parentId?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug?: string;

  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsEnum(EntityType)
  type!: EntityType;
}

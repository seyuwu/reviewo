import { Transform } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength
} from "class-validator";

const PLAY_INTENTS = ["fun", "ranked", "tournament"] as const;
const ROLE_VALUES = ["1", "2", "3", "4", "5"] as const;

export class CreateDotaProfileDto {
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value !== "string") {
      return value;
    }

    const trimmed = value.trim();

    return trimmed.length > 0 ? trimmed : undefined;
  })
  @IsString()
  @Matches(/^\d{8,10}$/)
  dotaAccountId?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value !== "string") {
      return value;
    }

    const trimmed = value.trim().toLowerCase();

    return trimmed.length > 0 ? trimmed : undefined;
  })
  @IsIn(["female", "male", "unspecified"])
  gender?: "female" | "male" | "unspecified";

  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @Matches(/^\d{1,5}(-\d{1,5})?$/)
  mmr?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @IsIn(ROLE_VALUES, { each: true })
  roles?: string[];

  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toUpperCase() : value))
  @IsString()
  @MaxLength(32)
  server?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsString()
  @MaxLength(16)
  language?: string;

  @IsOptional()
  @IsBoolean()
  hasMic?: boolean;

  @IsOptional()
  @IsIn(PLAY_INTENTS)
  playIntent?: (typeof PLAY_INTENTS)[number];
}

import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested
} from "class-validator";

class AnalyticsClientEventDto {
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  type!: string;

  @IsOptional()
  @IsString()
  @MaxLength(96)
  key?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(30 * 60 * 1000)
  durationMs?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  count?: number;
}

export class CollectAnalyticsDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  visitorId!: string;

  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => AnalyticsClientEventDto)
  events!: AnalyticsClientEventDto[];
}

import { IsInt, IsOptional, IsString, IsUrl, Max, MaxLength, Min } from "class-validator";
import { Transform } from "class-transformer";

export class ExtensionRateByUrlDto {
  @IsInt()
  @Max(5)
  @Min(1)
  score!: number;

  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MaxLength(200)
  sourceTitle?: string;

  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsUrl({ protocols: ["http", "https"], require_protocol: true })
  @MaxLength(2048)
  url!: string;
}

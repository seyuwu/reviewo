import { Transform } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsOptional, IsString, IsUUID } from "class-validator";

export class ConfirmDotaQualitiesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @IsString({ each: true })
  qualityKeys!: string[];

  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsUUID("4")
  visitorId?: string;
}

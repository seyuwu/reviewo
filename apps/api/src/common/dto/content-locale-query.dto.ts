import { IsIn, IsOptional, IsString } from "class-validator";

export class ContentLocaleQueryDto {
  @IsOptional()
  @IsString()
  @IsIn(["ru", "en", "all"])
  locale?: "ru" | "en" | "all";
}

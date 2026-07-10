import { IsIn, IsOptional, IsString } from "class-validator";

export class ReviewLocaleQueryDto {
  @IsOptional()
  @IsString()
  @IsIn(["ru", "en", "all"])
  locale?: "ru" | "en" | "all";
}

import { IsIn, IsOptional, IsString } from "class-validator";

export class EntityPageQueryDto {
  @IsOptional()
  @IsString()
  @IsIn(["ru", "en", "all"])
  locale?: "ru" | "en" | "all";
}

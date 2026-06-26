import { Transform } from "class-transformer";
import { IsString, MaxLength, MinLength } from "class-validator";

export class SearchEntitiesDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  query!: string;
}

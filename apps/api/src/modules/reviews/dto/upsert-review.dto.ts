import { Transform } from "class-transformer";
import { IsString, MaxLength, MinLength } from "class-validator";

export class UpsertReviewDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  text!: string;
}

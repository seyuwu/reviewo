import { Transform } from "class-transformer";
import { IsInt, Max, Min } from "class-validator";

export class RateEntityDto {
  @Transform(({ value }) => (typeof value === "string" ? Number(value) : value))
  @IsInt()
  @Min(1)
  @Max(5)
  score!: number;
}

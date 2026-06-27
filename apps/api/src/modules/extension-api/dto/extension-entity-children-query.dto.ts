import { Transform } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

export class ExtensionEntityChildrenQueryDto {
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === "") {
      return 20;
    }

    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : value;
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  limit: number = 20;
}

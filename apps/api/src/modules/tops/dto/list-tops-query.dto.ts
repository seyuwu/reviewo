import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

import { TOP_LIST_SORTS } from "../constants/top-list-sort.js";

export class ListTopsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsIn([...TOP_LIST_SORTS, "popular"])
  sort?: string;
}

import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, Max, Min } from "class-validator";

export class DiscoveryLimitQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}

export class DiscoveryRatingsTopQueryDto extends DiscoveryLimitQueryDto {
  @IsOptional()
  @IsIn(["week", "all"])
  window?: "week" | "all";
}

export class DiscoveryRatingsRisingQueryDto extends DiscoveryLimitQueryDto {
  @IsOptional()
  @IsIn(["day"])
  window?: "day";
}

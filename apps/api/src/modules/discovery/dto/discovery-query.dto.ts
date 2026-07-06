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
  @IsIn(["week", "votes", "reliability", "all"])
  window?: "week" | "votes" | "reliability" | "all";

  @IsOptional()
  @IsIn(["week", "votes", "reliability", "all"])
  sort?: "week" | "votes" | "reliability" | "all";
}

export class DiscoveryRatingsRisingQueryDto extends DiscoveryLimitQueryDto {
  @IsOptional()
  @IsIn(["day"])
  window?: "day";
}

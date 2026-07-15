import { Transform } from "class-transformer";
import { IsArray, IsIn, IsOptional, IsString, MaxLength } from "class-validator";

const ROLE_VALUES = ["1", "2", "3", "4", "5"] as const;

export class ListDotaLfgQueryDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toUpperCase() : value))
  @IsString()
  @MaxLength(32)
  server?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value !== "string") {
      return undefined;
    }

    const roles = value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

    return roles.length > 0 ? roles : undefined;
  })
  @IsArray()
  @IsIn(ROLE_VALUES, { each: true })
  roles?: string[];
}

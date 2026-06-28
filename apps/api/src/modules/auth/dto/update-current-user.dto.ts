import { Transform } from "class-transformer";
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

export class UpdateCurrentUserDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  displayName!: string;

  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @Transform(({ value }) => {
    if (typeof value !== "string") {
      return value;
    }

    const trimmedValue = value.trim().toLowerCase();

    return trimmedValue || undefined;
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  @Matches(/^[a-z0-9_]+$/)
  username?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  currentPassword?: string;
}

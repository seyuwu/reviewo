import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class RefreshTokenDto {
  @IsString()
  @MinLength(10)
  @MaxLength(200)
  refreshToken!: string;
}

export class LogoutDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  refreshToken?: string;
}

import { IsString, Matches, MaxLength, MinLength } from "class-validator";

export class RecoverAccountDto {
  @IsString()
  @MinLength(16)
  @MaxLength(128)
  @Matches(/^[A-Za-z0-9_-]+$/)
  token!: string;
}

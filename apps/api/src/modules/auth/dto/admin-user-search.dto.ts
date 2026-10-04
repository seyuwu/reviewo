import { IsString, MaxLength, MinLength } from "class-validator";

export class AdminUserSearchDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  q!: string;
}

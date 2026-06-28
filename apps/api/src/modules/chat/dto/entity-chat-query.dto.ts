import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from "class-validator";

export class SendEntityChatMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message!: string;
}

export class ListEntityChatMessagesQueryDto {
  @IsOptional()
  @IsUUID("4")
  before?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class ActiveNowQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}

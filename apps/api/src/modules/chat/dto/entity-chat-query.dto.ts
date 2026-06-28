import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

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
  limit?: number;
}

export class ActiveNowQueryDto {
  @IsOptional()
  limit?: number;
}

import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from "class-validator";

export class TournamentRoomMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  message!: string;
}

export class TournamentRoomDescriptionDto {
  @IsString()
  @MaxLength(1000)
  description!: string;
}

export class TournamentRoomMessagesQueryDto {
  @IsOptional()
  @IsUUID()
  before?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class TournamentRoomVoiceDto {
  @IsIn(["create", "join"])
  intent!: "create" | "join";
}

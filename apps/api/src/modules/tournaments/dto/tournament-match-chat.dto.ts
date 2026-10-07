import { ArrayMaxSize, ArrayUnique, IsArray, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

export class TournamentMatchChatMessageDto {
  @IsString() @MinLength(1) @MaxLength(4000)
  message!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(5) @ArrayUnique() @IsUUID("all", { each: true })
  mentionUserIds?: string[];
}

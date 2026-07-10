import { IsIn, IsOptional, IsUUID } from "class-validator";

export class SubmitBattleVoteDto {
  @IsUUID("4")
  entityId!: string;

  @IsOptional()
  @IsIn(["ru", "en"])
  locale?: "ru" | "en";
}

import { IsUUID } from "class-validator";

export class SubmitBattleVoteDto {
  @IsUUID("4")
  entityId!: string;
}

import { IsIn, IsUUID } from "class-validator";

export class ReplaceTournamentMatchSideDto {
  @IsIn(["A", "B"])
  side!: "A" | "B";

  @IsUUID()
  reserveEntryId!: string;
}

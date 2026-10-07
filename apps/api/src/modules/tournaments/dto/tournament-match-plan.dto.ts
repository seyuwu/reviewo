import { IsDateString, IsIn, IsInt, IsOptional, Max, Min } from "class-validator";

export class UpdateTournamentSeriesSettingsDto {
  @IsOptional()
  @IsIn([1, 3, 5])
  bestOf?: 1 | 3 | 5;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string | null;
}
export class UpdateTournamentMatchPlanDto extends UpdateTournamentSeriesSettingsDto {
  @IsIn(["MAIN", "LOWER", "BRONZE", "GRAND_FINAL"])
  bracketKind!: "MAIN" | "LOWER" | "BRONZE" | "GRAND_FINAL";
  @IsInt()
  @Min(0)
  @Max(14)
  roundOffset!: number;
  @IsInt()
  @Min(1)
  @Max(128)
  matchNumber!: number;
}

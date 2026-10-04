import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateDotaTournamentSquadDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsIn(["1", "2", "3", "4", "5"])
  positionRole!: "1" | "2" | "3" | "4" | "5";

  @IsOptional()
  @IsIn(["OPEN", "CONFIRM"])
  joinMode?: "OPEN" | "CONFIRM";
}

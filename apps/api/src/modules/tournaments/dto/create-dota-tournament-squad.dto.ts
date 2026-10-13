import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateDotaTournamentSquadDto {
  @IsOptional()
  @IsBoolean()
  companySearch?: boolean;
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @IsIn(["1", "2", "3", "4", "5"])
  positionRole!: "1" | "2" | "3" | "4" | "5";

  @IsOptional()
  @IsIn(["OPEN", "CONFIRM"])
  joinMode?: "OPEN" | "CONFIRM";
}

export class RenameDotaTournamentSquadDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;
}

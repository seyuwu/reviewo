import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export class RegisterDotaTournamentTeamDto {
  @IsString()
  @MaxLength(120)
  teamSlug!: string;

  @IsOptional()
  @IsIn(["OPEN", "CONFIRM"])
  joinMode?: "OPEN" | "CONFIRM";
}

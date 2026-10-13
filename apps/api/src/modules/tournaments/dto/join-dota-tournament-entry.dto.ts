import { IsBoolean, IsIn, IsISO8601, IsOptional, ValidateIf } from "class-validator";

export class JoinDotaTournamentEntryDto {
  @IsOptional() @IsBoolean() viaInvitation?: boolean;
  @IsIn(["1", "2", "3", "4", "5"])
  positionRole!: "1" | "2" | "3" | "4" | "5";
}

export class DecideDotaTournamentEntryRequestDto {
  @IsIn(["ACCEPT", "DECLINE"])
  decision!: "ACCEPT" | "DECLINE";

  @ValidateIf(
    (input: DecideDotaTournamentEntryRequestDto) =>
      input.requestUpdatedAt !== undefined || input.positionRole !== undefined
  )
  @IsISO8601()
  requestUpdatedAt?: string;

  @ValidateIf(
    (input: DecideDotaTournamentEntryRequestDto) =>
      input.requestUpdatedAt !== undefined || input.positionRole !== undefined
  )
  @IsIn(["1", "2", "3", "4", "5"])
  positionRole?: "1" | "2" | "3" | "4" | "5";
}

export class UpdateDotaTournamentEntryJoinModeDto {
  @IsIn(["OPEN", "CONFIRM"])
  joinMode!: "OPEN" | "CONFIRM";
}

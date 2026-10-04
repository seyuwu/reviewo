import { IsIn } from "class-validator";

export class JoinDotaTournamentEntryDto {
  @IsIn(["1", "2", "3", "4", "5"])
  positionRole!: "1" | "2" | "3" | "4" | "5";
}

export class DecideDotaTournamentEntryRequestDto {
  @IsIn(["ACCEPT", "DECLINE"])
  decision!: "ACCEPT" | "DECLINE";
}

export class UpdateDotaTournamentEntryJoinModeDto {
  @IsIn(["OPEN", "CONFIRM"])
  joinMode!: "OPEN" | "CONFIRM";
}

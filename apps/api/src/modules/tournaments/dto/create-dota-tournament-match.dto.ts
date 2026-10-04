import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min
} from "class-validator";

export const DOTA_TOURNAMENT_GAME_MODES = [
  "ALL_PICK",
  "RANDOM_DRAFT",
  "CAPTAINS_MODE",
  "CAPTAINS_DRAFT",
  "SINGLE_DRAFT"
] as const;

export const DOTA_TOURNAMENT_REGIONS = [
  "EUROPE",
  "RUSSIA",
  "US_EAST",
  "US_WEST",
  "SOUTH_AMERICA",
  "SOUTHEAST_ASIA",
  "CHINA",
  "AUSTRALIA",
  "SOUTH_AFRICA"
] as const;

export class CreateDotaTournamentMatchDto {
  @IsUUID()
  entryAId!: string;

  @IsUUID()
  entryBId!: string;

  @IsInt()
  @Min(1)
  @Max(64)
  roundNumber!: number;

  @IsInt()
  @Min(1)
  @Max(128)
  matchNumber!: number;

  @IsDateString()
  scheduledAt!: string;

  @IsIn(["A", "B"])
  hostSide!: "A" | "B";

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  streamUrl?: string;
}

export class SubmitDotaTournamentLobbyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  lobbyName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  lobbyPassword!: string;

  @IsIn(DOTA_TOURNAMENT_GAME_MODES)
  gameMode!: (typeof DOTA_TOURNAMENT_GAME_MODES)[number];

  @IsIn(DOTA_TOURNAMENT_REGIONS)
  serverRegion!: (typeof DOTA_TOURNAMENT_REGIONS)[number];

  @IsBoolean()
  allowSpectators!: boolean;

  @IsBoolean()
  cheatsEnabled!: boolean;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  lobbyProofUrl?: string;
}

export class DisputeDotaTournamentMatchDto {
  @IsString()
  @MaxLength(1000)
  reason!: string;
}

export class SubmitDotaTournamentResultDto {
  @IsUUID()
  winnerEntryId!: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  evidenceUrl?: string;
}

export class ResolveDotaTournamentMatchDto {
  @IsIn(["ENTRY_A", "ENTRY_B", "REPLAY", "CANCEL"])
  resolution!: "ENTRY_A" | "ENTRY_B" | "REPLAY" | "CANCEL";

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  note!: string;
}

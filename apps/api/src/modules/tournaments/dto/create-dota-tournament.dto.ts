import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested
} from "class-validator";
import { Type } from "class-transformer";
import {
  DOTA_TOURNAMENT_GAME_MODES,
  DOTA_TOURNAMENT_REGIONS
} from "./create-dota-tournament-match.dto.js";

export class DotaTournamentSponsorDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsUrl({ protocols: ["http", "https"], require_protocol: true })
  @MaxLength(1000)
  url!: string;

  @IsOptional()
  @IsUrl({ protocols: ["http", "https"], require_protocol: true })
  @MaxLength(1000)
  logoUrl?: string | null;
}

export class CreateDotaTournamentDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => DotaTournamentSponsorDto)
  sponsors?: DotaTournamentSponsorDto[];

  @IsOptional()
  @IsBoolean()
  automaticBracket?: boolean;
  @IsOptional()
  @IsIn(["SINGLE_ELIMINATION", "DOUBLE_ELIMINATION"])
  bracketFormat?: "SINGLE_ELIMINATION" | "DOUBLE_ELIMINATION";
  @IsString()
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  slug?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  format?: string | null;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  rulesUrl?: string | null;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  registrationClosesAt?: string;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(256)
  maxTeams?: number | null;

  @IsOptional()
  @IsIn(DOTA_TOURNAMENT_GAME_MODES)
  gameMode?: (typeof DOTA_TOURNAMENT_GAME_MODES)[number];

  @IsOptional()
  @IsIn(DOTA_TOURNAMENT_REGIONS)
  serverRegion?: (typeof DOTA_TOURNAMENT_REGIONS)[number];

  @IsOptional()
  @IsBoolean()
  allowSpectators?: boolean;

  @IsOptional()
  @IsBoolean()
  cheatsEnabled?: boolean;

  @IsOptional()
  @IsIn(["DRAFT", "REGISTRATION_OPEN", "REGISTRATION_CLOSED", "IN_PROGRESS", "COMPLETED", "CANCELLED"])
  status?: "DRAFT" | "REGISTRATION_OPEN" | "REGISTRATION_CLOSED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
}

export class UpdateDotaTournamentDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => DotaTournamentSponsorDto)
  sponsors?: DotaTournamentSponsorDto[];

  @IsOptional()
  @IsIn(["SINGLE_ELIMINATION", "DOUBLE_ELIMINATION"])
  bracketFormat?: "SINGLE_ELIMINATION" | "DOUBLE_ELIMINATION";
  @IsOptional()
  @IsBoolean()
  automaticBracket?: boolean;
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  slug?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  format?: string | null;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  rulesUrl?: string | null;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  registrationClosesAt?: string;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(256)
  maxTeams?: number | null;

  @IsOptional()
  @IsIn(DOTA_TOURNAMENT_GAME_MODES)
  gameMode?: (typeof DOTA_TOURNAMENT_GAME_MODES)[number];

  @IsOptional()
  @IsIn(DOTA_TOURNAMENT_REGIONS)
  serverRegion?: (typeof DOTA_TOURNAMENT_REGIONS)[number];

  @IsOptional()
  @IsBoolean()
  allowSpectators?: boolean;

  @IsOptional()
  @IsBoolean()
  cheatsEnabled?: boolean;

  @IsOptional()
  @IsIn(["DRAFT", "REGISTRATION_OPEN", "REGISTRATION_CLOSED", "IN_PROGRESS", "COMPLETED", "CANCELLED"])
  status?: "DRAFT" | "REGISTRATION_OPEN" | "REGISTRATION_CLOSED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
}

import { Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength
} from "class-validator";

import {
  GAMES_LAUNCH_CHANNELS,
  GAMES_LAUNCH_SUGGESTION_SOURCES
} from "../games-launch.constants.js";

export class UpdateGamesLaunchDto {
  @IsBoolean()
  searchLive!: boolean;
}

export class CreateGamesLaunchInterestDto {
  @IsIn([...GAMES_LAUNCH_CHANNELS])
  channel!: (typeof GAMES_LAUNCH_CHANNELS)[number];

  @IsString()
  @MinLength(2)
  @MaxLength(320)
  contact!: string;
}

export class CreateGamesLaunchSuggestionDto {
  @IsIn([...GAMES_LAUNCH_SUGGESTION_SOURCES])
  source!: (typeof GAMES_LAUNCH_SUGGESTION_SOURCES)[number];

  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  body!: string;

  @IsOptional()
  @IsString()
  @MaxLength(320)
  contact?: string;
}

export class GamesLaunchStatusDto {
  launchAt!: string;
  searchLive!: boolean;
  waitingCount!: number;
  averageMmr!: string | null;
  devNoteLikeCount!: number;
  devNoteLiked!: boolean;
}

export class ToggleGamesLaunchDevNoteLikeDto {
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  voterKey?: string;
}

export class GamesLaunchDevNoteLikeQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  voterKey?: string;
}

export class AdminGamesLaunchListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

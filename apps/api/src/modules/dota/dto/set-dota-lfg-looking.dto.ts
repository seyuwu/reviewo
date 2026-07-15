import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength
} from "class-validator";

import { DOTA_POSITION_ROLES } from "@reviewo/shared";

export class SetDotaLfgLookingDto {
  @IsBoolean()
  looking!: boolean;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  partySlug?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(5)
  @IsIn([...DOTA_POSITION_ROLES], { each: true })
  @Type(() => String)
  recruitedRoles?: string[];
}

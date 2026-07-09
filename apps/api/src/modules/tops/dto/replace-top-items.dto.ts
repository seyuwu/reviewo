import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested
} from "class-validator";

export class ReplaceTopItemInputDto {
  @IsUUID("4")
  entityId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  note?: string | null;
}

export class ReplaceTopItemsDto {
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ReplaceTopItemInputDto)
  items!: ReplaceTopItemInputDto[];
}

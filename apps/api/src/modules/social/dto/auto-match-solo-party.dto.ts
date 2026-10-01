import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsUUID,
  ValidateNested
} from "class-validator";

import { DOTA_POSITION_ROLES } from "@reviewo/shared";

export class AutoMatchSoloPartyMemberDto {
  @IsUUID("4")
  userId!: string;

  @IsIn([...DOTA_POSITION_ROLES])
  positionRole!: (typeof DOTA_POSITION_ROLES)[number];
}

export class AutoMatchSoloPartyMembersDto {
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(5)
  @ArrayUnique((member: AutoMatchSoloPartyMemberDto | null) => member?.userId)
  @ArrayUnique((member: AutoMatchSoloPartyMemberDto | null) => member?.positionRole)
  @ValidateNested({ each: true })
  @Type(() => AutoMatchSoloPartyMemberDto)
  members!: AutoMatchSoloPartyMemberDto[];
}

export class AutoMatchSoloPartyDto extends AutoMatchSoloPartyMembersDto {
  @IsUUID("4")
  leaderUserId!: string;
}

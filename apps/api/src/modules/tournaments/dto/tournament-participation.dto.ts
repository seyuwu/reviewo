import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsUUID, Min } from "class-validator";

export class StartTournamentSoloSearchDto {
  @IsOptional()
  @IsIn(["BOARD", "AUTO"])
  mode?: "BOARD" | "AUTO";
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ArrayUnique()
  @IsIn(["1", "2", "3", "4", "5"], { each: true })
  roles?: string[];
}

export class TournamentRecruitSearchDto {
  @IsBoolean() enabled!: boolean;
}
export class TournamentRecruitQueryDto {
  @IsOptional() @IsUUID("4") notice?: string;
}
export class TournamentRecruitInviteDto {
  @IsUUID("4") queueId!: string;
  @IsInt() @Min(1) generation!: number;
  @IsIn(["1", "2", "3", "4", "5"]) positionRole!: "1" | "2" | "3" | "4" | "5";
}

export interface TournamentSoloTicket {
  id: string;
  generation: number;
  leaseToken: string;
}

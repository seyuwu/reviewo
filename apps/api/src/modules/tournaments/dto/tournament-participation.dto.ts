import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsIn, IsOptional } from "class-validator";

export class StartTournamentSoloSearchDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ArrayUnique()
  @IsIn(["1", "2", "3", "4", "5"], { each: true })
  roles?: string[];
}

export interface TournamentSoloTicket {
  id: string;
  generation: number;
  leaseToken: string;
}

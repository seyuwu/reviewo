import { IsBoolean } from "class-validator";

export class SetTournamentModeratorDto {
  @IsBoolean()
  enabled!: boolean;
}

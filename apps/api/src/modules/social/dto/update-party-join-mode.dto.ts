import { IsIn } from "class-validator";

import type { GamePartyJoinMode } from "@reviewo/shared";

export class UpdatePartyJoinModeDto {
  @IsIn(["OPEN", "CONFIRM"])
  joinMode!: GamePartyJoinMode;
}

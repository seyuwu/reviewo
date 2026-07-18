import type { DotaProfile } from "../../dota/types/dota";
import type { DotaPositionRole, GameParty } from "../../social/types/social";
import type { IntentMode } from "./games-search-onboarding-types";

export type GamesSearchCinematicPhase =
  | "intent"
  | "mmr"
  | "roles"
  | "recruitRoles"
  | "creating"
  | "leftMorph"
  | "ready"
  | "reveal"
  | "profileMorph"
  | "layoutBirth"
  | "done";

export type GamesSearchCinematicVisualPhase = "hidden" | "left" | "feed" | "rail";

export interface GamesSearchCinematicResult {
  intentMode: IntentMode;
  mmr: string;
  party: GameParty | null;
  profile: DotaProfile;
  recruitedRoles: DotaPositionRole[];
  roles: DotaPositionRole[];
}

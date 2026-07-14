export type GameVerticalId = "dota" | "cs2" | "valorant" | "lol" | "apex";

export type GameVerticalStatus = "live" | "soon";

export interface GameVerticalDefinition {
  createPath: string | null;
  editPath: string | null;
  hubPath: string | null;
  id: GameVerticalId;
  logoGlyph: string;
  status: GameVerticalStatus;
  title: string;
}

/**
 * Linked game profiles belonging to the signed-in Opinia account.
 * Today only Dota can exist; other verticals stay empty until their APIs ship.
 */
export interface LinkedGameProfile {
  gameId: GameVerticalId;
  slug: string;
  title: string;
}

export interface GameProfileManagementCapabilities {
  /** When true, UI may offer “add another game” to the player’s Opinia profile. */
  canAddAdditionalGames: boolean;
  /** When true, UI may offer per-game “edit profile” actions. */
  canEditExistingGameProfiles: boolean;
}

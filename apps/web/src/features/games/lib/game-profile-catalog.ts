import type {
  GameProfileManagementCapabilities,
  GameVerticalDefinition,
  GameVerticalId,
  LinkedGameProfile
} from "../types/game-profile";

/**
 * Switch these on when multi-game add/edit UI should appear.
 * Scaffolding, routes helpers, and capacity checks already exist below.
 */
export const GAME_PROFILE_MANAGEMENT_UI: GameProfileManagementCapabilities = {
  canAddAdditionalGames: false,
  canEditExistingGameProfiles: false
};

export const GAME_VERTICALS: readonly GameVerticalDefinition[] = [
  {
    createPath: "/dota/create",
    editPath: "/dota/create",
    hubPath: "/dota",
    id: "dota",
    logoGlyph: "D",
    status: "live",
    title: "Dota 2"
  },
  {
    createPath: null,
    editPath: null,
    hubPath: null,
    id: "cs2",
    logoGlyph: "C",
    status: "soon",
    title: "CS2"
  },
  {
    createPath: null,
    editPath: null,
    hubPath: null,
    id: "valorant",
    logoGlyph: "V",
    status: "soon",
    title: "Valorant"
  },
  {
    createPath: null,
    editPath: null,
    hubPath: null,
    id: "lol",
    logoGlyph: "L",
    status: "soon",
    title: "League of Legends"
  },
  {
    createPath: null,
    editPath: null,
    hubPath: null,
    id: "apex",
    logoGlyph: "A",
    status: "soon",
    title: "Apex Legends"
  }
] as const;

export function getGameVertical(gameId: GameVerticalId): GameVerticalDefinition | undefined {
  return GAME_VERTICALS.find((game) => game.id === gameId);
}

export function listLiveGameVerticals(): GameVerticalDefinition[] {
  return GAME_VERTICALS.filter((game) => game.status === "live");
}

export function listSoonGameVerticals(): GameVerticalDefinition[] {
  return GAME_VERTICALS.filter((game) => game.status === "soon");
}

export function getGameCreatePath(gameId: GameVerticalId): string | null {
  return getGameVertical(gameId)?.createPath ?? null;
}

export function getGameEditPath(gameId: GameVerticalId): string | null {
  return getGameVertical(gameId)?.editPath ?? null;
}

export function getGameHubPath(gameId: GameVerticalId): string | null {
  return getGameVertical(gameId)?.hubPath ?? null;
}

export function getGameProfilePath(gameId: GameVerticalId, slug: string): string | null {
  if (gameId === "dota") {
    return `/dota/${encodeURIComponent(slug)}`;
  }

  return null;
}

export function listAddableGameVerticals(
  linkedProfiles: readonly LinkedGameProfile[]
): GameVerticalDefinition[] {
  if (!GAME_PROFILE_MANAGEMENT_UI.canAddAdditionalGames) {
    return [];
  }

  const linkedIds = new Set(linkedProfiles.map((profile) => profile.gameId));

  return GAME_VERTICALS.filter(
    (game) => game.status === "live" && game.createPath !== null && !linkedIds.has(game.id)
  );
}

export function canShowEditGameProfileAction(gameId: GameVerticalId): boolean {
  if (!GAME_PROFILE_MANAGEMENT_UI.canEditExistingGameProfiles) {
    return false;
  }

  return getGameEditPath(gameId) !== null;
}

export function buildLinkedGameProfilesFromDota(input: {
  slug: string;
  title?: string | null;
} | null): LinkedGameProfile[] {
  if (!input?.slug) {
    return [];
  }

  return [
    {
      gameId: "dota",
      slug: input.slug,
      title: input.title?.trim() || "Dota 2"
    }
  ];
}

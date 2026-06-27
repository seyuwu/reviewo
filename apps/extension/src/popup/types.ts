export type PopupScreenName = "HOME" | "SEARCH" | "ENTITY" | "SETTINGS";

export interface HomeScreenState {
  name: "HOME";
}

export interface SearchScreenState {
  name: "SEARCH";
  query: string;
}

export interface EntityScreenState {
  entity: EntityViewModel;
  name: "ENTITY";
  returnTo: "HOME" | "SEARCH";
}

export interface SettingsScreenState {
  name: "SETTINGS";
}

export type PopupScreenState =
  | HomeScreenState
  | SearchScreenState
  | EntityScreenState
  | SettingsScreenState;

export interface EntityViewModel {
  avgScore?: number;
  canonicalUrl: string;
  entityId?: string;
  entityPagePath?: string;
  myRatingScore?: number | null;
  pageUrl: string;
  parentEntityId?: string;
  parentEntityPagePath?: string;
  parentTitle?: string;
  pageTitle?: string;
  status: "found" | "not_found";
  title: string;
  trustConfidence?: number;
  votesCount?: number;
}

export interface RecentEntityRecord {
  canonicalUrl: string | null;
  entityPagePath: string;
  id: string;
  slug: string;
  title: string;
  visitedAt: string;
}

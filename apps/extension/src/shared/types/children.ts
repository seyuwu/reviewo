import type { ExtensionEntitySummary } from "./resolve.js";
import type { ExtensionRatingAggregate } from "./resolve.js";
import type { ExtensionWebLink } from "./resolve.js";

export interface ExtensionEntityChildItem {
  entity: ExtensionEntitySummary;
  rating: ExtensionRatingAggregate;
  web: ExtensionWebLink;
}

export interface ExtensionEntityChildrenResponse {
  children: ExtensionEntityChildItem[];
  parentId: string;
}

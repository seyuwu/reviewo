export const MIN_TOP_ITEMS = 3;
export const MAX_TOP_ITEMS = 50;
export const MAX_TOP_NOTE_LENGTH = 280;
export const MAX_TOP_COMMENT_LENGTH = 2000;
export const USER_TOP_MIN_VOTES = 5;
export const RESERVED_TOP_SLUG_PREFIX = "system-";

import { getAllSystemTopSlugs } from "../system-top-definitions.js";

export const RESERVED_SYSTEM_TOP_SLUGS = new Set<string>(getAllSystemTopSlugs());

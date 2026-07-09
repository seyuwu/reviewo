import type { RelatedPresenceDto } from "./related-presence.dto.js";

export class EntityPageRelatedPresenceDto {
  canonicalUrl!: string | null;
  id!: string;
  logoUrl!: string | null;
  rating!: RelatedPresenceDto["rating"];
  slug!: string;
  title!: string;
  type!: string;
}

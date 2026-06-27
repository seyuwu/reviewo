import type { RatingAggregateDto } from "../../ratings/dto/rating-aggregate.dto.js";

import type { ExtensionEntitySummaryDto } from "./extension-resolve-response.dto.js";
import type { ExtensionWebLinkDto } from "./extension-resolve-response.dto.js";

export class ExtensionEntityChildItemDto {
  entity!: ExtensionEntitySummaryDto;
  rating!: RatingAggregateDto;
  web!: ExtensionWebLinkDto;
}

export class ExtensionEntityChildrenResponseDto {
  children!: ExtensionEntityChildItemDto[];
  parentId!: string;
}

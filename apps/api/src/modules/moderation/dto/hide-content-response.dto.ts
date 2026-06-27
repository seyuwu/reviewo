import type { EntityVisibility, ReviewVisibility } from "@prisma/client";

export class HideEntityResponseDto {
  entityId!: string;
  hiddenAt!: string;
  visibility!: EntityVisibility;
}

export class HideReviewResponseDto {
  hiddenAt!: string;
  reviewId!: string;
  visibility!: ReviewVisibility;
}

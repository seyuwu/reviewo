import type { ReviewVisibility } from "@prisma/client";

export class ReviewDto {
  createdAt!: string;
  entityId!: string;
  id!: string;
  isOwnReview!: boolean;
  likedByCurrentUser!: boolean;
  likesCount!: number;
  text!: string;
  updatedAt!: string;
  visibility!: ReviewVisibility;
}

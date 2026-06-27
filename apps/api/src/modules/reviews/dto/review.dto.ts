import type { ReviewVisibility } from "@prisma/client";

export class ReviewDto {
  authorId!: string;
  createdAt!: string;
  entityId!: string;
  id!: string;
  likedByCurrentUser!: boolean;
  likesCount!: number;
  text!: string;
  updatedAt!: string;
  visibility!: ReviewVisibility;
}

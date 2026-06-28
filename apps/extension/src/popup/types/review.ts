export interface ExtensionReview {
  createdAt: string;
  entityId: string;
  id: string;
  isOwnReview: boolean;
  likedByCurrentUser: boolean;
  likesCount: number;
  text: string;
  updatedAt: string;
}

export type ExtensionReviewSort = "likes" | "newest";

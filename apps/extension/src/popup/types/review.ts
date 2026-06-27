export interface ExtensionReview {
  authorId: string;
  createdAt: string;
  entityId: string;
  id: string;
  likedByCurrentUser: boolean;
  likesCount: number;
  text: string;
  updatedAt: string;
}

export type ExtensionReviewSort = "likes" | "newest";

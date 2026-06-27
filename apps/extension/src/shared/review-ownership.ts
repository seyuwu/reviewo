export function isReviewByCurrentUser(authorId: string, currentUserId?: string): boolean {
  return Boolean(currentUserId && authorId === currentUserId);
}

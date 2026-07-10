import { ActivityActionType } from "./activity-action-type.js";

export const CONTRIBUTION_SCORE_POINTS: Record<string, number> = {
  [ActivityActionType.RatingCreated]: 1,
  [ActivityActionType.BattleVote]: 1,
  [ActivityActionType.ReviewCreated]: 3,
  [ActivityActionType.TopCreated]: 5,
  [ActivityActionType.DiscussionCreated]: 2,
  [ActivityActionType.EntityCreated]: 5,
  [ActivityActionType.ContributionApproved]: 20,
  [ActivityActionType.TopLiked]: 10,
  [ActivityActionType.TopForked]: 50
};

export const CONTRIBUTION_SCORE_DIMINISHING: Partial<
  Record<string, { fullLimit: number; halfLimit: number }>
> = {
  [ActivityActionType.RatingCreated]: { fullLimit: 20, halfLimit: 40 },
  [ActivityActionType.BattleVote]: { fullLimit: 20, halfLimit: 40 },
  [ActivityActionType.ReviewCreated]: { fullLimit: 5, halfLimit: 10 },
  [ActivityActionType.DiscussionCreated]: { fullLimit: 10, halfLimit: 20 },
  [ActivityActionType.TopCreated]: { fullLimit: 3, halfLimit: 6 }
};

export const EXPERTISE_SCORE_POINTS: Record<string, number> = {
  [ActivityActionType.RatingCreated]: 1,
  [ActivityActionType.ReviewCreated]: 4,
  [ActivityActionType.TopCreated]: 8,
  [ActivityActionType.DiscussionCreated]: 2,
  [ActivityActionType.ContributionApproved]: 6
};

export const CURATOR_RANK_WEIGHTS = {
  forkReceived: 15,
  likeReceived: 2,
  topCreated: 10
} as const;

export const MAX_EXPERTISE_AREAS = 5;

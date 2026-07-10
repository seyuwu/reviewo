export const ActivityActionType = {
  BattleVote: "battle.vote",
  ContributionApproved: "contribution.approved",
  DiscussionCreated: "discussion.created",
  EntityCreated: "entity.created",
  RatingCreated: "rating.created",
  ReviewCreated: "review.created",
  TopCreated: "top.created",
  TopForked: "top.forked",
  TopLiked: "top.liked",
  TopUpdated: "top.updated"
} as const;

export type ActivityActionTypeValue = (typeof ActivityActionType)[keyof typeof ActivityActionType];

import { CURATOR_RANK_WEIGHTS } from "../constants/contribution-score.js";

export interface CuratorCategoryStats {
  categoryId: string;
  forksReceived: number;
  likesReceived: number;
  topsCreated: number;
}

export interface CuratorRankArea {
  categoryId: string;
  score: number;
}

export class CuratorRankCalculator {
  calculate(stats: CuratorCategoryStats[]): CuratorRankArea[] {
    return stats
      .map((row) => ({
        categoryId: row.categoryId,
        score:
          row.topsCreated * CURATOR_RANK_WEIGHTS.topCreated +
          row.likesReceived * CURATOR_RANK_WEIGHTS.likeReceived +
          row.forksReceived * CURATOR_RANK_WEIGHTS.forkReceived
      }))
      .filter((row) => row.score > 0)
      .sort((left, right) => right.score - left.score);
  }
}

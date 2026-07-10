import { EXPERTISE_SCORE_POINTS, MAX_EXPERTISE_AREAS } from "../constants/contribution-score.js";

export interface ExpertiseEvent {
  actionType: string;
  categoryId: string | null;
  entityType: string | null;
}

export interface ExpertiseArea {
  scopeKey: string;
  scopeType: "category" | "entity_type";
  score: number;
}

export class ExpertiseCalculator {
  calculate(events: ExpertiseEvent[]): ExpertiseArea[] {
    const scores = new Map<string, ExpertiseArea>();

    for (const event of events) {
      const points = EXPERTISE_SCORE_POINTS[event.actionType];

      if (!points) {
        continue;
      }

      if (event.categoryId) {
        this.addScore(scores, "category", event.categoryId, points);
      }

      if (event.entityType) {
        this.addScore(scores, "entity_type", event.entityType, points);
      }
    }

    return [...scores.values()]
      .filter((area) => area.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, MAX_EXPERTISE_AREAS);
  }

  private addScore(
    scores: Map<string, ExpertiseArea>,
    scopeType: ExpertiseArea["scopeType"],
    scopeKey: string,
    points: number
  ): void {
    const key = `${scopeType}:${scopeKey}`;
    const existing = scores.get(key);

    if (existing) {
      existing.score += points;
      return;
    }

    scores.set(key, {
      scopeKey,
      scopeType,
      score: points
    });
  }
}

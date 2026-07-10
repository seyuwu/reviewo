import {
  CONTRIBUTION_SCORE_DIMINISHING,
  CONTRIBUTION_SCORE_POINTS
} from "../constants/contribution-score.js";

export interface ContributionScoreEvent {
  actionType: string;
  createdAt: Date;
}

export interface ContributionScoreActionBreakdown {
  points: number;
  rawCount: number;
}

export interface ContributionScoreBreakdown {
  byActionType: Record<string, ContributionScoreActionBreakdown>;
  total: number;
}

export class ContributionScoreCalculator {
  calculate(events: ContributionScoreEvent[]): number {
    return this.calculateBreakdown(events).total;
  }

  calculateBreakdown(events: ContributionScoreEvent[]): ContributionScoreBreakdown {
    const dayBuckets = new Map<string, Map<string, number>>();
    const byActionType: Record<string, ContributionScoreActionBreakdown> = {};
    let total = 0;

    for (const event of events) {
      const basePoints = CONTRIBUTION_SCORE_POINTS[event.actionType];

      if (!basePoints) {
        continue;
      }

      const dayKey = event.createdAt.toISOString().slice(0, 10);
      const diminishing = CONTRIBUTION_SCORE_DIMINISHING[event.actionType];
      let multiplier = 1;

      if (diminishing) {
        const dayActions = dayBuckets.get(dayKey) ?? new Map<string, number>();
        const actionIndex = (dayActions.get(event.actionType) ?? 0) + 1;
        dayActions.set(event.actionType, actionIndex);
        dayBuckets.set(dayKey, dayActions);

        if (actionIndex > diminishing.halfLimit) {
          multiplier = 0.1;
        } else if (actionIndex > diminishing.fullLimit) {
          multiplier = 0.5;
        }
      }

      const points = basePoints * multiplier;
      total += points;

      const current = byActionType[event.actionType] ?? { points: 0, rawCount: 0 };
      byActionType[event.actionType] = {
        points: current.points + points,
        rawCount: current.rawCount + 1
      };
    }

    for (const actionType of Object.keys(byActionType)) {
      const entry = byActionType[actionType];

      if (!entry) {
        continue;
      }

      byActionType[actionType] = {
        points: Math.round(entry.points),
        rawCount: entry.rawCount
      };
    }

    return {
      byActionType,
      total: Math.round(total)
    };
  }
}

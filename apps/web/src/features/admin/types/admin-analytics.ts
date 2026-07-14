export interface AnalyticsOverview {
  averagesByPath: Array<{ avgSeconds: number; pathKey: string; samples: number }>;
  byDay: Array<{
    day: string;
    pageviews: number;
    registrations: number;
    uniques: number;
  }>;
  funnel: Record<string, number>;
  rangeDays: number;
  totals: {
    avgDailyUniques: number | null;
    avgSecondsOnSite: number | null;
    pageviews: number;
    registrations: number;
    uniqueVisitorDays: number;
  };
  topCtas: Array<{ clicks: number; ctaKey: string }>;
}

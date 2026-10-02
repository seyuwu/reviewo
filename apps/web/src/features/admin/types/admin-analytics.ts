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
  telegramBot: {
    accounts: number;
    accountsConnectedInRange: number;
    activeSearchUsers: number;
    soloSearchUsers: number;
    recruitingParties: number;
    openSlots: number;
  };
  platformTotals: {
    accounts: number;
    activeAccounts: number;
    accountsCreatedInRange: number;
    dotaProfiles: number;
    dotaParties: number;
    activeDotaParties: number;
  };
  topCtas: Array<{ clicks: number; ctaKey: string }>;
}

export type DotaSearchType = "SOLO" | "RECRUIT";

export interface DotaSearchHistoryItem {
  durationSeconds: number;
  id: string;
  matchedCount: number;
  partyName: string | null;
  searchType: DotaSearchType;
  source: "telegram" | "web";
  startedAt: string;
  status: "ACTIVE" | "JOINED" | "CANCELLED" | "EXPIRED";
  userName: string;
}

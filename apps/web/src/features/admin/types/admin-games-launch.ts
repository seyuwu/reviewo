export type AdminGamesLaunchInterestItem = {
  id: string;
  channel: string;
  contact: string;
  userId: string | null;
  createdAt: string;
};

export type AdminGamesLaunchSuggestionItem = {
  id: string;
  source: string;
  body: string;
  contact: string | null;
  userId: string | null;
  createdAt: string;
};

export type AdminGamesLaunchListResponse<T> = {
  items: T[];
  total: number;
  sheetsConfigured: boolean;
};

export type AdminGamesLaunchMetrics = {
  rangeDays: number;
  dotaHostUniques: number;
  dotaHostPageviews: number;
  formStarts: number;
  telegramJoins: number;
  interestSubmits: number;
  inviteClicks: number;
  inviteVisits: number;
  createProfileClicks: number;
  profileShareClicks: number;
  conversionFormStartPct: number | null;
  conversionSubmitPct: number | null;
};

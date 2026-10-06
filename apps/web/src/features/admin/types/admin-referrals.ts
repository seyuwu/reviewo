export interface ReferralLeader {
  inviterTelegramId: string;
  displayName: string;
  telegramUsername: string | null;
  userId: string | null;
  invited: number;
  accounts: number;
  searched: number;
  joined: number;
}
export interface ReferralLeaderboard {
  from: string;
  to: string;
  timezone: string;
  offset: number;
  pageSize: number;
  updatedAt: string;
  totals: {
    invited: number;
    inviters: number;
    accounts: number;
    createdAccounts: number;
    searched: number;
    joined: number;
  };
  items: ReferralLeader[];
}
export interface ReferralInvitees {
  total: number;
  offset: number;
  pageSize: number;
  items: Array<{
    inviteeTelegramId: string;
    displayName: string;
    telegramUsername: string | null;
    startedAt: string;
    accountCreatedAt: string | null;
    accountReadyAt: string | null;
    searchStartedAt: string | null;
    partyJoinedAt: string | null;
  }>;
}

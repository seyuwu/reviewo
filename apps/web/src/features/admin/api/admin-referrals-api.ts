import { apiRequest } from "../../../lib/api/api-client";
import type { ReferralInvitees, ReferralLeaderboard } from "../types/admin-referrals";

export function fetchReferralLeaderboard(token: string, from: string, to: string, offset: number) {
  return apiRequest<ReferralLeaderboard>(
    `/admin/analytics/referrals?${new URLSearchParams({ from, to, offset: String(offset) })}`,
    {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store"
    }
  );
}
export function fetchReferralInvitees(
  token: string,
  id: string,
  from: string,
  to: string,
  offset: number
) {
  return apiRequest<ReferralInvitees>(
    `/admin/analytics/referrals/${encodeURIComponent(id)}?${new URLSearchParams({ from, to, offset: String(offset) })}`,
    {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store"
    }
  );
}

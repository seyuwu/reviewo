export const TOURNAMENT_AFTERPARTY_MS = 12 * 60 * 60 * 1000;

export function tournamentRoomState(
  entry: { status: string },
  tournament: { status: string; finishedAt: Date | null; updatedAt: Date },
  now = new Date()
): { phase: "TOURNAMENT" | "AFTERPARTY" | "CLOSED"; expiresAt: Date | null } {
  if (!["RECRUITING", "REGISTERED", "RESERVE"].includes(entry.status))
    return { phase: "CLOSED", expiresAt: null };
  if (["COMPLETED", "CANCELLED"].includes(tournament.status)) {
    const expiresAt = new Date(
      (tournament.finishedAt ?? tournament.updatedAt).getTime() + TOURNAMENT_AFTERPARTY_MS
    );
    return { phase: expiresAt > now ? "AFTERPARTY" : "CLOSED", expiresAt };
  }
  return {
    phase: ["REGISTRATION_OPEN", "REGISTRATION_CLOSED", "IN_PROGRESS"].includes(tournament.status)
      ? "TOURNAMENT"
      : "CLOSED",
    expiresAt: null
  };
}

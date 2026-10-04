export type DotaTournamentStatus =
  | "DRAFT"
  | "REGISTRATION_OPEN"
  | "REGISTRATION_CLOSED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

export interface DotaTournamentSummary {
  allowSpectators: boolean;
  cheatsEnabled: boolean;
  description: string;
  format: string | null;
  gameMode: string;
  id: string;
  maxTeams: number | null;
  registeredTeams: number;
  registrationClosesAt: string | null;
  rulesUrl: string | null;
  serverRegion: string;
  slug: string;
  startsAt: string | null;
  status: DotaTournamentStatus;
  title: string;
}

export interface DotaTournamentEntryMember {
  displayName: string;
  dotaProfileSlug: string | null;
  mmr: number | null;
  positionRole: string | null;
}

export interface DotaTournamentEntry {
  id: string;
  joinMode: "OPEN" | "CONFIRM";
  members: DotaTournamentEntryMember[];
  status: "RECRUITING" | "REGISTERED" | "WITHDRAWN" | "DISQUALIFIED";
  teamName: string;
  teamPartySlug: string | null;
}

export interface DotaTournament extends DotaTournamentSummary {
  entries: DotaTournamentEntry[];
  matches?: DotaTournamentMatchSummary[];
}

export interface DotaTournamentMatchSummary {
  allowSpectators: boolean;
  cheatsEnabled: boolean;
  confirmationDeadlineAt: string | null;
  entryA: { id: string; teamName: string };
  entryB: { id: string; teamName: string };
  gameMode: string;
  hostSide: "A" | "B";
  id: string;
  lobbyDeadlineAt: string;
  matchNumber: number;
  reportedWinnerEntryId: string | null;
  resultDeadlineAt: string | null;
  roundNumber: number;
  scheduledAt: string;
  serverRegion: string;
  status:
    | "SCHEDULED"
    | "LOBBY_CONFIRMATION"
    | "READY"
    | "IN_PROGRESS"
    | "RESULT_CONFIRMATION"
    | "DISPUTED"
    | "COMPLETED"
    | "CANCELLED";
  streamUrl: string | null;
  winnerEntryId: string | null;
}

export interface DotaTournamentMatch extends DotaTournamentMatchSummary {
  canManageLobby: boolean;
  disputeReason: string | null;
  lobbyName: string | null;
  lobbyPassword: string | null;
  lobbyProofUrl: string | null;
  resultEvidenceUrl: string | null;
  resultReporterSide: "A" | "B" | null;
  viewerSide: "A" | "B";
}

export interface AdminDotaTournamentMatch extends DotaTournamentMatchSummary {
  disputeReason: string | null;
  lobbyName: string | null;
  lobbyProofUrl: string | null;
  resultEvidenceUrl: string | null;
  resolutionNote: string | null;
}

export interface DotaTournamentTeamEntry {
  entryId: string;
  joinMode: "OPEN" | "CONFIRM";
  members: DotaTournamentEntryMember[];
  requests: Array<{
    displayName: string;
    dotaProfileSlug: string | null;
    id: string;
    mmr: number | null;
    positionRole: string;
  }>;
  status: "RECRUITING" | "REGISTERED" | "WITHDRAWN" | "DISQUALIFIED";
  tournament: DotaTournamentSummary;
}

export interface DotaTournamentManagedEntry {
  entryId: string;
  joinMode: "OPEN" | "CONFIRM";
  members: DotaTournamentEntryMember[];
  requests: Array<{
    displayName: string;
    dotaProfileSlug: string | null;
    id: string;
    mmr: number | null;
    positionRole: string;
  }>;
  status: "RECRUITING" | "REGISTERED";
}

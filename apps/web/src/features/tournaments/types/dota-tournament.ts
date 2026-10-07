export type DotaTournamentStatus =
  | "DRAFT"
  | "REGISTRATION_OPEN"
  | "REGISTRATION_CLOSED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

export interface DotaTournamentSummary {
  automaticBracket?: boolean;
  bracketFormat?: "SINGLE_ELIMINATION" | "DOUBLE_ELIMINATION";
  bracketGeneratedAt?: string | null;
  podium?: Array<{
    place: number;
    entryId: string | null;
    teamName: string | null;
    members: DotaTournamentEntryMember[];
  }>;
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
  status: "RECRUITING" | "REGISTERED" | "RESERVE" | "WITHDRAWN" | "DISQUALIFIED";
  teamName: string;
  teamPartySlug: string | null;
}

export interface DotaTournament extends DotaTournamentSummary {
  planning?: boolean;
  bracket?: {
    size: number;
    seeds: Array<{ entryId: string; seed: number; averageMmr: number | null }>;
    nodes: Array<{
      key: string;
      kind: "MAIN" | "BRONZE" | "LOWER" | "GRAND_FINAL";
      roundNumber: number;
      matchNumber: number;
      entryAId: string | null;
      entryBId: string | null;
      sourceA: string | null;
      sourceB: string | null;
      sourceAResult?: "WINNER" | "LOSER" | null;
      sourceBResult?: "WINNER" | "LOSER" | null;
      bestOf?: number;
      scheduledAt?: string | null;
      roundOffset?: number;
      canEditBestOf?: boolean;
      canEditTime?: boolean;
      score?: { A: number; B: number } | null;
      matchId: string | null;
      status: string;
      winnerEntryId: string | null;
    }>;
  } | null;
  entries: DotaTournamentEntry[];
  matches?: DotaTournamentMatchSummary[];
}

export interface DotaTournamentMatchSummary {
  canManageMatch?: boolean;
  bestOf?: number;
  gameNumber?: number;
  technicalVictory?: boolean;
  hasStarted?: boolean;
  score?: { A: number; B: number };
  gameResults?: Array<{ gameNumber: number; dotaMatchId: string | null; winnerEntryId: string | null;
    startedAt: string | null; completedAt: string | null }>;
  dotaMatchId?: string | null;
  bracketKind?: string;
  allowSpectators: boolean;
  cheatsEnabled: boolean;
  confirmationDeadlineAt: string | null;
  captainAReadyAt: string | null;
  captainBReadyAt: string | null;
  spectatorAdmissionEndsAt: string | null;
  serverNow: string;
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
    | "SPECTATOR_ADMISSION"
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
  canConfirmLobby: boolean;
  canManageLobby: boolean;
  canSubmitMatchGameId?: boolean;
  disputeReason: string | null;
  lobbyName: string | null;
  lobbyPassword: string | null;
  lobbyProofUrl: string | null;
  resultEvidenceUrl: string | null;
  resultReporterSide: "A" | "B" | null;
  viewerSide: "A" | "B";
}

export interface PublicDotaTournamentMatch extends DotaTournamentMatchSummary {
  canReadChat?: boolean;
  isParticipant: boolean;
  tournament: { slug: string; title: string };
  rosters: { A: DotaTournamentEntryMember[]; B: DotaTournamentEntryMember[] };
}

export interface AdminDotaTournamentMatch extends DotaTournamentMatchSummary {
  disputeReason: string | null;
  lobbyName: string | null;
  lobbyPassword: string | null;
  lobbyProofUrl: string | null;
  resultEvidenceUrl: string | null;
  resultReporterSide: "A" | "B" | null;
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
  status: "RECRUITING" | "REGISTERED" | "RESERVE" | "WITHDRAWN" | "DISQUALIFIED";
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
  status: "RECRUITING" | "REGISTERED" | "RESERVE";
}

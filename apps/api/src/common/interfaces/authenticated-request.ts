export interface AuthenticatedUser {
  avatarUrl: string | null;
  displayName: string;
  email: string | null;
  id: string;
  role: "ADMIN" | "TOURNAMENT_MODERATOR" | "USER";
  status: string;
  username: string | null;
}

export interface AuthenticatedRequest {
  user?: AuthenticatedUser;
}

export interface AuthenticatedUser {
  displayName: string;
  email: string | null;
  id: string;
  status: string;
  username: string | null;
}

export interface AuthenticatedRequest {
  user?: AuthenticatedUser;
}

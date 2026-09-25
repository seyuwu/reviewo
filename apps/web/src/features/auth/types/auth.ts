export interface CurrentUser {
  avatarUrl: string | null;
  displayName: string;
  email: string | null;
  id: string;
}

export interface AuthResponse {
  accessToken: string;
  expiresIn: number;
  refreshToken?: string;
  tokenType: "Bearer";
  user: CurrentUser;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput extends LoginInput {
  displayName: string;
}

export interface StoredAuthSession {
  accessToken: string;
  avatarUrl: string | null;
  displayName: string;
  email: string | null;
  /** Kept in localStorage only: the shared auth cookie must stay small enough for browsers. */
  refreshToken?: string;
  userId: string;
}

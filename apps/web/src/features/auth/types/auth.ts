export interface CurrentUser {
  displayName: string;
  email: string | null;
  id: string;
}

export interface AuthResponse {
  accessToken: string;
  expiresIn: number;
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
  displayName: string;
  email: string | null;
}

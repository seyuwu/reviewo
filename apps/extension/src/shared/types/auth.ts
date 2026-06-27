export interface ExtensionCurrentUser {
  displayName: string;
  email: string | null;
  id: string;
  status: string;
  username: string | null;
}

export interface ExtensionAuthResponse {
  accessToken: string;
  expiresIn: number;
  tokenType: "Bearer";
  user: ExtensionCurrentUser;
}

export interface ExtensionLoginInput {
  email: string;
  password: string;
}

export interface ExtensionRegisterInput extends ExtensionLoginInput {
  displayName: string;
}

export interface ExtensionStoredAuthSession {
  accessToken: string;
  displayName: string;
  email: string | null;
  userId: string;
}

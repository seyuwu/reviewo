export interface CurrentUserProfile {
  displayName: string;
  email: string | null;
  id: string;
  status: string;
  username: string | null;
}

export interface UpdateCurrentUserProfileInput {
  currentPassword?: string;
  displayName: string;
  email: string;
  username?: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

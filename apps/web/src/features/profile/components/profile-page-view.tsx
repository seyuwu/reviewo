"use client";

import type { TranslateFn } from "@reviewo/i18n";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { FormFeedback } from "../../../components/form-feedback";
import { ApiError } from "../../../lib/api/api-error";
import { useTranslation } from "../../i18n/locale-provider";
import { MinimalAuthPanel } from "../../auth/components/minimal-auth-panel";
import { useAuthSession } from "../../auth/hooks/use-auth-session";
import {
  changeCurrentUserPassword,
  getCurrentUserProfile,
  updateCurrentUserAvatar,
  updateCurrentUserProfile
} from "../api/profile";
import { fileToAvatarDataUrl } from "../lib/resize-avatar";
import type { CurrentUserProfile } from "../types/profile";
import { ProfileDashboardSummary } from "./profile-dashboard-summary";
import { ProfileUserTopsSection } from "./profile-user-tops-section";
import { ProfileAdminLink } from "./profile-editor-stats-section";

type ProfileFlowState = "loading" | "guest" | "authenticated";

export function ProfilePageView() {
  const t = useTranslation();
  const queryClient = useQueryClient();
  const { authSession, isAuthSessionLoaded, signOut, storeAuthSession, updateAuthSession } =
    useAuthSession();
  const accessToken = authSession?.accessToken;

  const profileQuery = useQuery({
    enabled: Boolean(accessToken),
    queryFn: () => getCurrentUserProfile(accessToken ?? ""),
    queryKey: ["profile", "me", accessToken]
  });

  useEffect(() => {
    if (!profileQuery.data) {
      return;
    }

    updateAuthSession({
      avatarUrl: profileQuery.data.avatarUrl,
      displayName: profileQuery.data.displayName,
      email: profileQuery.data.email
    });
    // Sync session once when loaded profile changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    profileQuery.data?.avatarUrl,
    profileQuery.data?.displayName,
    profileQuery.data?.email,
    profileQuery.data?.id
  ]);

  const flowState: ProfileFlowState = !isAuthSessionLoaded
    ? "loading"
    : !authSession
      ? "guest"
      : "authenticated";

  return (
    <section
      className={`profile-flow-shell profile-flow-shell-${flowState}`}
      aria-busy={flowState === "loading" || profileQuery.isLoading}
    >
      {flowState === "loading" ? (
        <AuthFlowSkeleton />
      ) : flowState === "guest" ? (
        <div key="guest" className="auth-center-page ui-fade-in">
          <div className="auth-center-card">
            <header className="auth-center-header">
              <p className="eyebrow">{t("common.account")}</p>
              <h1 id="auth-heading">{t("auth.context.signInToOpinia")}</h1>
              <p className="muted-copy">{t("auth.context.signInHint")}</p>
            </header>

            <MinimalAuthPanel
              authSession={authSession}
              contextLabel={t("auth.context.registerOrSignIn")}
              onAuthSuccess={(authResponse) => {
                storeAuthSession(authResponse);
              }}
              onSignOut={signOut}
            />
          </div>
        </div>
      ) : (
        <div key="authenticated" className="profile-page profile-page-authenticated ui-fade-in">
          <div className="profile-panel-centered">
            {profileQuery.isLoading ? (
              <div className="panel-card profile-panel">
                <ProfilePanelSkeleton />
              </div>
            ) : null}
            {profileQuery.isError ? (
              <div className="panel-card profile-panel">
                <ProfileStateMessage message={t("web.profile.loadError")} />
              </div>
            ) : null}
            {profileQuery.data ? (
              <>
                <ProfileDashboardSummary
                  accessToken={accessToken ?? ""}
                  profile={profileQuery.data}
                />
                <ProfileAdminLink isAdmin={profileQuery.data.role === "ADMIN"} />
                <ProfileUserTopsSection userId={profileQuery.data.id} />
                <div className="panel-card profile-panel profile-settings-panel" id="profile-settings">
                  <header className="panel-header">
                    <h2>{t("web.profile.dashboard.settingsTitle")}</h2>
                  </header>
                <ProfileDetails
                  accessToken={accessToken ?? ""}
                  showIdentity={false}
                  profile={profileQuery.data}
                  onProfileUpdated={(profile) => {
                    updateAuthSession({
                      avatarUrl: profile.avatarUrl,
                      displayName: profile.displayName,
                      email: profile.email
                    });
                    queryClient.setQueryData(["profile", "me", accessToken], profile);
                  }}
                  onSignOut={signOut}
                  t={t}
                />
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}

function AuthFlowSkeleton() {
  return (
    <div className="auth-center-page" aria-hidden="true">
      <div className="auth-center-card">
        <div className="ui-skeleton ui-skeleton-heading" />
        <div className="ui-skeleton ui-skeleton-copy" />
        <div className="panel-card auth-form-skeleton">
          <div className="ui-skeleton ui-skeleton-segment" />
          <div className="ui-skeleton ui-skeleton-field" />
          <div className="ui-skeleton ui-skeleton-field" />
          <div className="ui-skeleton ui-skeleton-field" />
          <div className="ui-skeleton ui-skeleton-button" />
        </div>
      </div>
    </div>
  );
}

function ProfilePanelSkeleton() {
  return (
    <div className="profile-details" aria-hidden="true">
      <div className="ui-skeleton ui-skeleton-avatar" />
      <div className="ui-skeleton ui-skeleton-line ui-skeleton-line-short" />
      <div className="ui-skeleton ui-skeleton-line" />
      <div className="profile-fields">
        <div className="ui-skeleton ui-skeleton-field-row" />
        <div className="ui-skeleton ui-skeleton-field-row" />
        <div className="ui-skeleton ui-skeleton-field-row" />
        <div className="ui-skeleton ui-skeleton-field-row" />
      </div>
    </div>
  );
}


function ProfileDetails({
  accessToken,
  onProfileUpdated,
  profile,
  onSignOut,
  showIdentity = true,
  t
}: {
  accessToken: string;
  onProfileUpdated: (profile: CurrentUserProfile) => void;
  profile: CurrentUserProfile;
  onSignOut: () => void;
  showIdentity?: boolean;
  t: TranslateFn;
}) {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [email, setEmail] = useState(profile.email ?? "");
  const [profileCurrentPassword, setProfileCurrentPassword] = useState("");
  const [profileStatusMessage, setProfileStatusMessage] = useState<string | null>(null);
  const [profileErrorMessage, setProfileErrorMessage] = useState<string | null>(null);
  const [passwordCurrentPassword, setPasswordCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordStatusMessage, setPasswordStatusMessage] = useState<string | null>(null);
  const [passwordErrorMessage, setPasswordErrorMessage] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarErrorMessage, setAvatarErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setDisplayName(profile.displayName);
    setEmail(profile.email ?? "");
  }, [profile]);

  const updateProfileMutation = useMutation({
    mutationFn: () =>
      updateCurrentUserProfile(
        {
          displayName,
          email,
          ...(profileCurrentPassword ? { currentPassword: profileCurrentPassword } : {})
        },
        accessToken
      ),
    onError: (error) => {
      setProfileStatusMessage(null);
      setProfileErrorMessage(readProfileApiError(error, t));
    },
    onSuccess: (updatedProfile) => {
      setProfileCurrentPassword("");
      setProfileErrorMessage(null);
      setProfileStatusMessage(t("web.profile.saveSuccess"));
      onProfileUpdated(updatedProfile);
    }
  });

  const changePasswordMutation = useMutation({
    mutationFn: () =>
      changeCurrentUserPassword(
        {
          currentPassword: passwordCurrentPassword,
          newPassword
        },
        accessToken
      ),
    onError: (error) => {
      setPasswordStatusMessage(null);
      setPasswordErrorMessage(readProfileApiError(error, t));
    },
    onSuccess: () => {
      setPasswordCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setPasswordErrorMessage(null);
      setPasswordStatusMessage(t("web.profile.passwordSuccess"));
    }
  });

  function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const isEmailChanging = email.trim().toLowerCase() !== (profile.email ?? "").toLowerCase();

    if (!displayName.trim() || !email.trim()) {
      setProfileStatusMessage(null);
      setProfileErrorMessage(t("web.profile.validation.required"));
      return;
    }

    if (isEmailChanging && !profileCurrentPassword) {
      setProfileStatusMessage(null);
      setProfileErrorMessage(t("web.profile.validation.passwordForEmail"));
      return;
    }

    updateProfileMutation.mutate();
  }

  function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!passwordCurrentPassword || !newPassword || !confirmNewPassword) {
      setPasswordStatusMessage(null);
      setPasswordErrorMessage(t("web.profile.validation.required"));
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setPasswordStatusMessage(null);
      setPasswordErrorMessage(t("web.profile.passwordMismatch"));
      return;
    }

    if (newPassword === passwordCurrentPassword) {
      setPasswordStatusMessage(null);
      setPasswordErrorMessage(t("web.profile.passwordReuse"));
      return;
    }

    changePasswordMutation.mutate();
  }

  async function handleAvatarChange(file: File | null) {
    if (!file) {
      return;
    }

    setAvatarBusy(true);
    setAvatarErrorMessage(null);

    try {
      const imageDataUrl = await fileToAvatarDataUrl(file);
      const updatedProfile = await updateCurrentUserAvatar(imageDataUrl, accessToken);
      onProfileUpdated(updatedProfile);
    } catch {
      setAvatarErrorMessage(t("web.profile.avatarError"));
    } finally {
      setAvatarBusy(false);
    }
  }

  return (
    <div className="profile-details ui-fade-in">
      {showIdentity ? (
        <>
          <div className="profile-avatar" aria-hidden="true">
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt="" className="profile-avatar-image" src={profile.avatarUrl} />
            ) : (
              getInitials(displayName)
            )}
          </div>
          <div>
            <p className="result-type">{t("web.profile.currentUser")}</p>
            <h2>{displayName.trim() || profile.displayName}</h2>
            <p className="muted-copy">{email || t("web.profile.noEmail")}</p>
          </div>
        </>
      ) : null}

      <div className="profile-avatar-editor">
        <div className="profile-avatar" aria-hidden="true">
          {profile.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="" className="profile-avatar-image" src={profile.avatarUrl} />
          ) : (
            getInitials(displayName)
          )}
        </div>
        <div className="profile-avatar-editor-copy">
          <p className="result-type">{t("web.profile.avatarEyebrow")}</p>
          <strong>{t("web.profile.avatarTitle")}</strong>
          <p className="muted-copy">{t("web.profile.avatarHint")}</p>
          <label className="button-secondary profile-avatar-upload">
            <input
              accept="image/jpeg,image/png,image/webp"
              disabled={avatarBusy}
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                event.target.value = "";
                void handleAvatarChange(file);
              }}
              type="file"
            />
            {avatarBusy ? t("web.profile.avatarBusy") : t("web.profile.avatarChange")}
          </label>
          {avatarErrorMessage ? <FormFeedback errorMessage={avatarErrorMessage} /> : null}
        </div>
      </div>

      <form className="profile-edit-form form-stack" onSubmit={handleProfileSubmit}>
        <div className="section-heading">
          <p className="result-type">{t("web.profile.editEyebrow")}</p>
          <h3>{t("web.profile.editTitle")}</h3>
        </div>
        <label className="field-label">
          <span>{t("web.profile.displayName")}</span>
          <input
            autoComplete="name"
            maxLength={100}
            type="text"
            value={displayName}
            onChange={(event) => {
              setDisplayName(event.target.value);
            }}
          />
        </label>
        <label className="field-label">
          <span>{t("web.profile.email")}</span>
          <input
            autoComplete="email"
            maxLength={320}
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
            }}
          />
        </label>
        <label className="field-label">
          <span>{t("web.profile.currentPassword")}</span>
          <input
            autoComplete="current-password"
            maxLength={128}
            minLength={8}
            type="password"
            value={profileCurrentPassword}
            onChange={(event) => {
              setProfileCurrentPassword(event.target.value);
            }}
          />
          <small>{t("web.profile.currentPasswordHint")}</small>
        </label>
        <button
          type="submit"
          className="primary-button"
          disabled={updateProfileMutation.isPending}
        >
          {updateProfileMutation.isPending ? t("web.profile.saving") : t("web.profile.saveProfile")}
        </button>
        <FormFeedback errorMessage={profileErrorMessage} statusMessage={profileStatusMessage} />
      </form>

      <form className="profile-edit-form form-stack" onSubmit={handlePasswordSubmit}>
        <div className="section-heading">
          <p className="result-type">{t("web.profile.securityEyebrow")}</p>
          <h3>{t("web.profile.passwordTitle")}</h3>
        </div>
        <label className="field-label">
          <span>{t("web.profile.currentPassword")}</span>
          <input
            autoComplete="current-password"
            maxLength={128}
            minLength={8}
            type="password"
            value={passwordCurrentPassword}
            onChange={(event) => {
              setPasswordCurrentPassword(event.target.value);
            }}
          />
        </label>
        <label className="field-label">
          <span>{t("web.profile.newPassword")}</span>
          <input
            autoComplete="new-password"
            maxLength={128}
            minLength={8}
            type="password"
            value={newPassword}
            onChange={(event) => {
              setNewPassword(event.target.value);
            }}
          />
        </label>
        <label className="field-label">
          <span>{t("web.profile.confirmNewPassword")}</span>
          <input
            autoComplete="new-password"
            maxLength={128}
            minLength={8}
            type="password"
            value={confirmNewPassword}
            onChange={(event) => {
              setConfirmNewPassword(event.target.value);
            }}
          />
        </label>
        <button
          type="submit"
          className="primary-button"
          disabled={changePasswordMutation.isPending}
        >
          {changePasswordMutation.isPending
            ? t("web.profile.passwordSaving")
            : t("web.profile.changePassword")}
        </button>
        <FormFeedback errorMessage={passwordErrorMessage} statusMessage={passwordStatusMessage} />
      </form>

      <div className="profile-actions">
        <Link className="primary-link" href="/">
          {t("web.backToSearch")}
        </Link>
        <button type="button" className="secondary-button" onClick={onSignOut}>
          {t("web.profile.signOut")}
        </button>
      </div>
    </div>
  );
}

function readProfileApiError(error: unknown, t: TranslateFn): string {
  if (error instanceof ApiError) {
    if (error.status === 400 || error.status === 401) {
      return t("web.profile.error.invalidPassword");
    }

    if (error.status === 409) {
      return t("web.profile.error.conflict");
    }
  }

  return t("web.profile.error.generic");
}

function ProfileStateMessage({ message }: { message: string }) {
  return <p className="muted-copy ui-fade-in">{message}</p>;
}

function getInitials(displayName: string): string {
  const initials = displayName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return initials || "R";
}

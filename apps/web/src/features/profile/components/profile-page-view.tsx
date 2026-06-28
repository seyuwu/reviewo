"use client";

import type { TranslateFn } from "@reviewo/i18n";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { useTranslation } from "../../i18n/locale-provider";
import { MinimalAuthPanel } from "../../auth/components/minimal-auth-panel";
import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { getCurrentUserProfile } from "../api/profile";
import type { CurrentUserProfile } from "../types/profile";

type ProfileFlowState = "loading" | "guest" | "authenticated";

export function ProfilePageView() {
  const t = useTranslation();
  const { authSession, isAuthSessionLoaded, signOut, storeAuthSession } = useAuthSession();
  const accessToken = authSession?.accessToken;

  const profileQuery = useQuery({
    enabled: Boolean(accessToken),
    queryFn: () => getCurrentUserProfile(accessToken ?? ""),
    queryKey: ["profile", "me", accessToken]
  });

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
              <h1 id="auth-heading">{t("auth.context.signInToReviewo")}</h1>
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
          <div className="profile-hero">
            <p className="eyebrow">{t("web.nav.profile")}</p>
            <h1 id="profile-heading">{t("web.profile.title")}</h1>
            <p className="hero-copy">{t("web.profile.subtitle")}</p>
          </div>

          <div className="profile-panel-centered">
            <div className="panel-card profile-panel">
              {profileQuery.isLoading ? <ProfilePanelSkeleton /> : null}
              {profileQuery.isError ? (
                <ProfileStateMessage message={t("web.profile.loadError")} />
              ) : null}
              {profileQuery.data ? (
                <ProfileDetails profile={profileQuery.data} onSignOut={signOut} t={t} />
              ) : null}
            </div>
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
  profile,
  onSignOut,
  t
}: {
  profile: CurrentUserProfile;
  onSignOut: () => void;
  t: TranslateFn;
}) {
  return (
    <div className="profile-details ui-fade-in">
      <div className="profile-avatar" aria-hidden="true">
        {getInitials(profile.displayName)}
      </div>
      <div>
        <p className="result-type">{t("web.profile.currentUser")}</p>
        <h2>{profile.displayName}</h2>
        <p className="muted-copy">{profile.email ?? t("web.profile.noEmail")}</p>
      </div>

      <div className="profile-fields" aria-label={t("web.profile.fieldsAriaLabel")}>
        <ProfileField label={t("web.profile.userId")} value={profile.id} />
        <ProfileField label={t("web.profile.username")} value={profile.username ?? t("web.profile.notSet")} />
        <ProfileField label={t("web.profile.status")} value={profile.status} />
        <ProfileField label={t("web.profile.email")} value={profile.email ?? t("web.profile.notSet")} />
      </div>

      <div className="profile-note">
        <div className="profile-actions">
          <Link className="primary-link" href="/">
            {t("web.backToSearch")}
          </Link>
          <button type="button" className="secondary-button" onClick={onSignOut}>
            {t("web.profile.signOut")}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div className="profile-field">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
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

"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { MinimalAuthPanel } from "../../auth/components/minimal-auth-panel";
import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { getCurrentUserProfile } from "../api/profile";
import type { CurrentUserProfile } from "../types/profile";

type ProfileFlowState = "loading" | "guest" | "authenticated";

export function ProfilePageView() {
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
              <p className="eyebrow">Account</p>
              <h1 id="auth-heading">Sign in to Reviewo</h1>
              <p className="muted-copy">
                Register or log in to rate pages, leave reviews, and keep your session in sync with
                the browser extension.
              </p>
            </header>

            <MinimalAuthPanel
              authSession={authSession}
              contextLabel="Register or sign in"
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
            <p className="eyebrow">Profile</p>
            <h1 id="profile-heading">Your Reviewo account.</h1>
            <p className="hero-copy">
              A minimal read-only profile for the current authenticated user. Profile editing and
              activity feeds are intentionally deferred.
            </p>
          </div>

          <div className="profile-panel-centered">
            <div className="panel-card profile-panel">
              {profileQuery.isLoading ? <ProfilePanelSkeleton /> : null}
              {profileQuery.isError ? (
                <ProfileStateMessage message="Profile could not be loaded. Sign in again and retry." />
              ) : null}
              {profileQuery.data ? (
                <ProfileDetails profile={profileQuery.data} onSignOut={signOut} />
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
  onSignOut
}: {
  profile: CurrentUserProfile;
  onSignOut: () => void;
}) {
  return (
    <div className="profile-details ui-fade-in">
      <div className="profile-avatar" aria-hidden="true">
        {getInitials(profile.displayName)}
      </div>
      <div>
        <p className="result-type">Current user</p>
        <h2>{profile.displayName}</h2>
        <p className="muted-copy">{profile.email ?? "No email on profile"}</p>
      </div>

      <div className="profile-fields" aria-label="Basic profile information">
        <ProfileField label="User ID" value={profile.id} />
        <ProfileField label="Username" value={profile.username ?? "Not set"} />
        <ProfileField label="Status" value={profile.status} />
        <ProfileField label="Email" value={profile.email ?? "Not set"} />
      </div>

      <div className="profile-note">
        <p>
          Recent ratings and reviews are not shown yet because user activity endpoints are outside
          this stage.
        </p>
        <div className="profile-actions">
          <Link className="primary-link" href="/">
            Back to search
          </Link>
          <button type="button" className="secondary-button" onClick={onSignOut}>
            Sign out
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

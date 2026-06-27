"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { MinimalAuthPanel } from "../../auth/components/minimal-auth-panel";
import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { getCurrentUserProfile } from "../api/profile";
import type { CurrentUserProfile } from "../types/profile";

export function ProfilePageView() {
  const { authSession, isAuthSessionLoaded, signOut, storeAuthSession } = useAuthSession();
  const accessToken = authSession?.accessToken;

  const profileQuery = useQuery({
    enabled: Boolean(accessToken),
    queryFn: () => getCurrentUserProfile(accessToken ?? ""),
    queryKey: ["profile", "me", accessToken]
  });

  return (
    <section className="profile-page" aria-labelledby="profile-heading">
      <div className="profile-hero">
        <p className="eyebrow">Profile</p>
        <h1 id="profile-heading">Your Reviewo account.</h1>
        <p className="hero-copy">
          A minimal read-only profile for the current authenticated user. Profile editing and
          activity feeds are intentionally deferred.
        </p>
      </div>

      <div className="profile-grid">
        <MinimalAuthPanel
          authSession={authSession}
          contextLabel="Sign in to view profile"
          onAuthSuccess={(authResponse) => {
            storeAuthSession(authResponse);
          }}
          onSignOut={signOut}
        />

        <div className="panel-card profile-panel">
          {!isAuthSessionLoaded ? <ProfileStateMessage message="Loading local session..." /> : null}
          {isAuthSessionLoaded && !authSession ? (
            <ProfileStateMessage message="Sign in to load your account details from the API." />
          ) : null}
          {profileQuery.isLoading ? <ProfileStateMessage message="Loading profile..." /> : null}
          {profileQuery.isError ? (
            <ProfileStateMessage message="Profile could not be loaded. Sign in again and retry." />
          ) : null}
          {profileQuery.data ? <ProfileDetails profile={profileQuery.data} /> : null}
        </div>
      </div>
    </section>
  );
}

function ProfileDetails({ profile }: { profile: CurrentUserProfile }) {
  return (
    <div className="profile-details">
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
        <Link className="primary-link" href="/">
          Back to search
        </Link>
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
  return <p className="muted-copy">{message}</p>;
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

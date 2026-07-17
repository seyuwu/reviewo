"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { FormFeedback } from "../../../components/form-feedback";
import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { useTranslation } from "../../i18n/locale-provider";
import { redeemFriendInvite } from "../../social/api/social-api";
import { fetchDotaProfileBySlug } from "../api/dota-api";
import { useDotaProfileConfirmations } from "../hooks/use-dota-profile-confirmations";
import { trackDotaEvent } from "../lib/analytics";
import { trackAnalyticsCta } from "../../analytics/components/product-analytics-listener";
import {
  consumePendingFriendInvite,
  peekPendingFriendInvite,
  stashPendingFriendInvite
} from "../lib/friend-invite-storage";
import { formatDotaMmr, formatDotaRoles, getDotaGenderLabel } from "../lib/labels";
import { copyDotaShareText } from "../lib/share";
import type { DotaProfile } from "../types/dota";
import { DotaClaimEmailBanner } from "./dota-claim-email-banner";
import { DotaFriendshipActions } from "./dota-friendship-actions";
import { DotaIdCopyField } from "./dota-id-copy-field";
import { DotaProfileAvatarEditor } from "./dota-profile-avatar-editor";
import { DotaProfileFlags } from "./dota-profile-flags";
import { DotaRecoveryNotice } from "./dota-recovery-notice";
import { DotaSharePanel } from "./dota-share-panel";
import { GamesLaunchWaitBanner } from "../../games/components/games-launch-wait-banner";
import styles from "./dota-profile-view.module.css";

interface DotaProfileViewProps {
  profile: DotaProfile;
}

function lookLikeFriendInviteToken(value: string | null): value is string {
  if (!value || value === "1") {
    return false;
  }

  const parts = value.split(".");
  return parts.length === 3 && parts.every((part) => part.length > 0);
}

export function DotaProfileView({ profile: initialProfile }: DotaProfileViewProps) {
  const t = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { authSession, isAuthSessionLoaded } = useAuthSession();
  const [profile, setProfile] = useState(initialProfile);
  const [shouldAutoOpenShare, setShouldAutoOpenShare] = useState(false);
  const [friendInviteMessage, setFriendInviteMessage] = useState<string | null>(null);
  const [friendInviteError, setFriendInviteError] = useState<string | null>(null);
  const [copiedProfileLink, setCopiedProfileLink] = useState(false);
  const [copyProfileError, setCopyProfileError] = useState<string | null>(null);
  const sharePanelRef = useRef<HTMLElement>(null);
  const friendInviteHandledRef = useRef(false);
  const justCreated = searchParams.get("created") === "1";
  const friendInviteTokenFromUrl = searchParams.get("friendInvite");
  const urlInviteToken = lookLikeFriendInviteToken(friendInviteTokenFromUrl)
    ? friendInviteTokenFromUrl
    : null;
  const showSharePanel =
    (profile.isOwner || justCreated) && profile.progress.current < profile.progress.target;
  const hasReputationConfirmations = profile.progress.current >= profile.progress.target;
  const confirmations = useDotaProfileConfirmations(profile, {
    onProfileUpdated: setProfile
  });

  async function handleCopyProfileLink() {
    setCopyProfileError(null);
    const copied = await copyDotaShareText("profile", profile, t);

    if (!copied) {
      setCopyProfileError(t("dota.share.copyError"));
      return;
    }

    setCopiedProfileLink(true);
    trackDotaEvent("dota_share_copied", { kind: "profile", slug: profile.slug });
    trackAnalyticsCta("dota_share_profile");
    window.setTimeout(() => setCopiedProfileLink(false), 2200);
  }

  useEffect(() => {
    setProfile(initialProfile);
  }, [initialProfile]);

  useEffect(() => {
    if (!authSession?.accessToken) {
      return;
    }

    let isCancelled = false;

    void fetchDotaProfileBySlug(initialProfile.slug, authSession.accessToken)
      .then((nextProfile) => {
        if (!isCancelled) {
          setProfile(nextProfile);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setProfile(initialProfile);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [authSession?.accessToken, initialProfile]);

  useEffect(() => {
    if (!justCreated) {
      return;
    }

    setShouldAutoOpenShare(true);
    router.replace(`/dota/${initialProfile.slug}`, { scroll: false });

    const scrollTimeout = window.setTimeout(() => {
      sharePanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);

    return () => {
      window.clearTimeout(scrollTimeout);
    };
  }, [initialProfile.slug, justCreated, router]);

  useEffect(() => {
    if (!isAuthSessionLoaded || friendInviteHandledRef.current) {
      return;
    }

    const pending = peekPendingFriendInvite();
    const pendingForProfile = pending?.slug === initialProfile.slug ? pending : null;
    const inviteToken = urlInviteToken ?? pendingForProfile?.token ?? null;

    if (!inviteToken) {
      if (friendInviteTokenFromUrl === "1") {
        setFriendInviteError(t("dota.friends.inviteInvalid"));
        router.replace(`/dota/${initialProfile.slug}`, { scroll: false });
      }
      return;
    }

    if (!authSession?.accessToken) {
      stashPendingFriendInvite({ slug: initialProfile.slug, token: inviteToken });
      setFriendInviteMessage(t("dota.friends.inviteSignIn"));
      return;
    }

    consumePendingFriendInvite(initialProfile.slug);

    if (initialProfile.isOwner || profile.friendshipStatus === "self") {
      friendInviteHandledRef.current = true;
      setFriendInviteMessage(t("dota.friends.inviteSelf"));
      router.replace(`/dota/${initialProfile.slug}`, { scroll: false });
      return;
    }

    if (profile.friendshipStatus === "friends") {
      friendInviteHandledRef.current = true;
      router.replace(`/dota/${initialProfile.slug}`, { scroll: false });
      return;
    }

    friendInviteHandledRef.current = true;
    let cancelled = false;

    void redeemFriendInvite(inviteToken, authSession.accessToken)
      .then(async () => {
        if (cancelled) {
          return;
        }

        const refreshed = await fetchDotaProfileBySlug(
          initialProfile.slug,
          authSession.accessToken
        );
        setProfile(refreshed);
        setFriendInviteMessage(t("dota.friends.inviteRedeemed"));
        setFriendInviteError(null);
        router.replace(`/dota/${initialProfile.slug}`, { scroll: false });
      })
      .catch(() => {
        if (!cancelled) {
          friendInviteHandledRef.current = false;
          setFriendInviteError(t("dota.friends.inviteInvalid"));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    authSession?.accessToken,
    friendInviteTokenFromUrl,
    initialProfile.isOwner,
    initialProfile.slug,
    isAuthSessionLoaded,
    profile.friendshipStatus,
    router,
    t,
    urlInviteToken
  ]);

  return (
    <section className={`creation-card ${styles.page}`}>
      <header className={styles.header}>
        <p className="eyebrow">{t("dota.profile.eyebrow")}</p>
        <h1>{profile.title}</h1>
        <DotaFriendshipActions onProfileUpdated={setProfile} profile={profile} />
        {profile.isOwner ? <DotaProfileAvatarEditor displayName={profile.title} /> : null}
        {friendInviteMessage ? <p className={styles.ownerHint}>{friendInviteMessage}</p> : null}
        {friendInviteError ? <FormFeedback errorMessage={friendInviteError} /> : null}
      </header>

      {profile.isOwner ? <DotaRecoveryNotice slug={profile.slug} /> : null}
      {profile.isOwner ? <DotaClaimEmailBanner isOwner={profile.isOwner} /> : null}
      {profile.isOwner ? <GamesLaunchWaitBanner /> : null}

      <div className={`profile-fields ${styles.metaGrid}`}>
        <DotaIdCopyField accountId={profile.dotaAccountId} showFillCta={profile.isOwner} />
        <div className="profile-field">
          <span>{t("dota.profile.mmr")}</span>
          <strong>{formatDotaMmr(profile.mmr)}</strong>
          {profile.mmr ? <small>{t("dota.create.selfReported")}</small> : null}
        </div>
        <div className="profile-field">
          <span>{t("dota.profile.roles")}</span>
          <strong>{formatDotaRoles(profile.roles)}</strong>
        </div>
        <div className="profile-field">
          <span>{t("dota.profile.server")}</span>
          <strong>{profile.server ?? "—"}</strong>
        </div>
        {profile.gender && profile.gender !== "unspecified" ? (
          <div className="profile-field">
            <span>{t("dota.profile.gender")}</span>
            <strong>{getDotaGenderLabel(profile.gender, t)}</strong>
          </div>
        ) : null}
      </div>

      {showSharePanel ? (
        <DotaSharePanel
          autoOpenModal={shouldAutoOpenShare && profile.isOwner}
          panelRef={sharePanelRef}
          profile={profile}
        />
      ) : null}

      <div className={styles.confirmZone}>
        {profile.isOwner ? (
          hasReputationConfirmations ? (
            <div className={styles.ownerShareRow}>
              <button
                className={`primary-button ${styles.copyProfileButton}`}
                onClick={() => void handleCopyProfileLink()}
                type="button"
              >
                {copiedProfileLink
                  ? t("dota.share.copied")
                  : t("dota.profile.copyProfileLink")}
              </button>
              {copyProfileError ? <FormFeedback errorMessage={copyProfileError} /> : null}
            </div>
          ) : (
            <p className={styles.ownerHint}>{t("dota.profile.ownerConfirmHint")}</p>
          )
        ) : null}

        {confirmations.error ? (
          <div className={styles.errorBanner}>
            <FormFeedback errorMessage={confirmations.error} />
          </div>
        ) : null}

        <DotaProfileFlags confirmations={confirmations} profile={profile} />
      </div>

      <div className={`profile-actions ${styles.footerActions}`}>
        {profile.isOwner ? (
          <Link className="app-nav-link" href="/dota/create">
            {t("dota.profile.editLink")}
          </Link>
        ) : (
          <Link
            className="primary-button"
            href="/dota/create"
            onClick={() => {
              if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("dota:confirmer-signup-started"));
              }
            }}
          >
            {t("dota.profile.createOwn")}
          </Link>
        )}
      </div>
    </section>
  );
}

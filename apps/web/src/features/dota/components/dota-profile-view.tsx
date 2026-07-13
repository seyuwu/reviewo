"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { FormFeedback } from "../../../components/form-feedback";
import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { useTranslation } from "../../i18n/locale-provider";
import { fetchDotaProfileBySlug } from "../api/dota-api";
import { useDotaProfileConfirmations } from "../hooks/use-dota-profile-confirmations";
import { formatDotaMmr, formatDotaRoles } from "../lib/labels";
import type { DotaProfile } from "../types/dota";
import { DotaIdCopyField } from "./dota-id-copy-field";
import { DotaProfileFlags } from "./dota-profile-flags";
import { DotaProfileQualities } from "./dota-profile-qualities";
import { DotaSharePanel } from "./dota-share-panel";
import styles from "./dota-profile-view.module.css";

interface DotaProfileViewProps {
  profile: DotaProfile;
}

export function DotaProfileView({ profile: initialProfile }: DotaProfileViewProps) {
  const t = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { authSession } = useAuthSession();
  const [profile, setProfile] = useState(initialProfile);
  const [shouldAutoOpenShare, setShouldAutoOpenShare] = useState(false);
  const sharePanelRef = useRef<HTMLElement>(null);
  const justCreated = searchParams.get("created") === "1";
  const showSharePanel =
    (profile.isOwner || justCreated) && profile.progress.current < profile.progress.target;
  const confirmations = useDotaProfileConfirmations(profile);

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

  return (
    <section className={`creation-card ${styles.page}`}>
      <header className={styles.header}>
        <p className="eyebrow">{t("dota.profile.eyebrow")}</p>
        <h1>{profile.title}</h1>
      </header>

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
          <p className={styles.ownerHint}>{t("dota.profile.ownerConfirmHint")}</p>
        ) : null}

        {confirmations.error ? (
          <div className={styles.errorBanner}>
            <FormFeedback errorMessage={confirmations.error} />
          </div>
        ) : null}

        <DotaProfileQualities confirmations={confirmations} profile={profile} />

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

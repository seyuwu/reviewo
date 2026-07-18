"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { ApiError } from "../../../lib/api/api-error";
import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { useTranslation } from "../../i18n/locale-provider";
import {
  createDotaProfile,
  createGuestDotaProfile,
  fetchMyDotaProfile,
  setDotaLfgLooking,
  updateMyDotaProfile
} from "../api/dota-api";
import { trackDotaEvent } from "../lib/analytics";
import { trackAnalyticsCta } from "../../analytics/components/product-analytics-listener";
import {
  isDotaProfileAlreadyExistsError,
  resolveDotaFormError
} from "../lib/resolve-dota-form-error";
import {
  formatDotaMmrRange,
  isValidDotaMmrInput,
  parseDotaMmrRange,
  resolveDotaMmrMode
} from "../lib/labels";
import { stashDotaRecovery } from "../lib/recovery-storage";
import type { DotaProfile } from "../types/dota";
import { GamesLaunchWaitBanner } from "../../games/components/games-launch-wait-banner";
import { DotaMmrField } from "./dota-mmr-field";
import styles from "./dota-create-form.module.css";

const ROLE_OPTIONS = ["1", "2", "3", "4", "5"] as const;
const SERVER_OPTIONS = ["EU", "RU", "US", "SEA"] as const;

type PlayIntent = "fun" | "ranked" | "tournament";
type ProfileLoadState = "idle" | "loading" | "loaded";

export function DotaCreateForm() {
  const t = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { authSession, isAuthSessionLoaded, signOut, storeAuthSession, updateAuthSession } =
    useAuthSession();
  const dotaIdFieldRef = useRef<HTMLLabelElement | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [dotaAccountId, setDotaAccountId] = useState("");
  const [mmrFrom, setMmrFrom] = useState("");
  const [mmrTo, setMmrTo] = useState("");
  const [roles, setRoles] = useState<string[]>([]);
  const [server, setServer] = useState<(typeof SERVER_OPTIONS)[number]>("EU");
  const [gender, setGender] = useState<"female" | "male" | "unspecified">("unspecified");
  const [hasMic, setHasMic] = useState(true);
  const [playIntent, setPlayIntent] = useState<PlayIntent>("ranked");
  const [existingProfile, setExistingProfile] = useState<DotaProfile | null>(null);
  const [profileLoadState, setProfileLoadState] = useState<ProfileLoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [highlightDotaId, setHighlightDotaId] = useState(false);
  const [showValidation, setShowValidation] = useState(false);

  const isEditMode = existingProfile !== null;
  const focusDotaId = searchParams.get("focus") === "dotaId";
  const mmrMode = resolveDotaMmrMode(mmrFrom, mmrTo);
  const hasValidMmr = isValidDotaMmrInput(mmrFrom, mmrTo, mmrMode);

  const validationMessage = useMemo(() => {
    // Nick is optional on create — API assigns a default. Required only when editing.
    if (isEditMode && displayName.trim().length < 1) {
      return t("dota.create.validation.displayName");
    }

    if (dotaAccountId.trim() && !/^\d{8,10}$/.test(dotaAccountId.trim())) {
      return t("dota.create.validation.dotaAccountId");
    }

    if (roles.length === 0) {
      return t("dota.create.rolesRequired");
    }

    if (!isEditMode && !hasValidMmr) {
      return t("dota.create.mmrRequired");
    }

    return null;
  }, [displayName, dotaAccountId, hasValidMmr, isEditMode, roles.length, t]);

  const bottomError = error ?? (showValidation ? validationMessage : null);

  useEffect(() => {
    if (!isAuthSessionLoaded) {
      return;
    }

    if (!authSession?.accessToken) {
      setExistingProfile(null);
      setDisplayName("");
      setProfileLoadState("loaded");
      return;
    }

    let isCancelled = false;
    setProfileLoadState("loading");
    setDisplayName(authSession.displayName);

    void fetchMyDotaProfile(authSession.accessToken)
      .then((profile) => {
        if (isCancelled) {
          return;
        }

        applyProfileToForm(profile);
        setExistingProfile(profile);
        setProfileLoadState("loaded");
      })
      .catch((loadError) => {
        if (isCancelled) {
          return;
        }

        if (!(loadError instanceof ApiError) || loadError.status !== 404) {
          setError(t("dota.create.loadError"));
        }

        setExistingProfile(null);
        setProfileLoadState("loaded");
      });

    return () => {
      isCancelled = true;
    };
  }, [authSession?.accessToken, isAuthSessionLoaded, t]);

  useEffect(() => {
    if (!focusDotaId || profileLoadState !== "loaded") {
      return;
    }

    setHighlightDotaId(true);
    dotaIdFieldRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    const input = dotaIdFieldRef.current?.querySelector("input");
    input?.focus();

    const highlightTimeout = window.setTimeout(() => {
      setHighlightDotaId(false);
      router.replace("/dota/create", { scroll: false });
    }, 1200);

    return () => {
      window.clearTimeout(highlightTimeout);
    };
  }, [focusDotaId, profileLoadState, router]);

  function applyProfileToForm(profile: DotaProfile) {
    const { from, to } = parseDotaMmrRange(profile.mmr);

    setDisplayName(profile.title);
    setDotaAccountId(profile.dotaAccountId);
    setMmrFrom(from);
    setMmrTo(to);
    setRoles(profile.roles);
    setServer(resolveServer(profile.server));
    setGender(resolveGender(profile.gender));
    setHasMic(profile.hasMic ?? true);
    setPlayIntent(resolvePlayIntent(profile.playIntent));
  }

  function handleMmrChange(from: string, to: string) {
    setMmrFrom(from);
    setMmrTo(to);
  }

  function toggleRole(role: string) {
    setRoles((current) =>
      current.includes(role) ? current.filter((value) => value !== role) : [...current, role]
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setShowValidation(true);

    if (validationMessage) {
      return;
    }

    setIsSubmitting(true);

    const accessToken = authSession?.accessToken;
    const mmr = formatDotaMmrRange(mmrFrom, mmrTo);
    const trimmedDotaAccountId = dotaAccountId.trim();
    const trimmedDisplayName = displayName.trim();
    const profilePayload = {
      ...(trimmedDotaAccountId ? { dotaAccountId: trimmedDotaAccountId } : {}),
      gender,
      hasMic,
      ...(mmr ? { mmr } : {}),
      playIntent,
      roles,
      server,
      // Create: omit title so API picks default / account name. Edit: always send nick.
      ...(isEditMode ? { title: trimmedDisplayName } : {})
    };

    try {
      if (isEditMode) {
        if (!accessToken) {
          setError(t("dota.create.signInRequired"));
          return;
        }

        const profile = await updateMyDotaProfile(profilePayload, accessToken);
        updateAuthSession({ displayName: profile.title });
        trackDotaEvent("dota_profile_updated", { slug: profile.slug });
        router.push(`/dota/${profile.slug}`);
        return;
      }

      if (!mmr) {
        setError(t("dota.create.mmrRequired"));
        return;
      }

      if (!accessToken) {
        const guestResponse = await createGuestDotaProfile(profilePayload);
        storeAuthSession({
          accessToken: guestResponse.accessToken,
          expiresIn: guestResponse.expiresIn,
          tokenType: guestResponse.tokenType,
          user: {
            avatarUrl: guestResponse.user.avatarUrl ?? null,
            displayName: guestResponse.user.displayName,
            email: guestResponse.user.email,
            id: guestResponse.user.id
          }
        });
        stashDotaRecovery({
          recoveryToken: guestResponse.recoveryToken,
          recoveryUrl: guestResponse.recoveryUrl,
          slug: guestResponse.profile.slug
        });
        trackDotaEvent("dota_profile_created", { slug: guestResponse.profile.slug });
        trackAnalyticsCta("dota_create_submit");

        const pendingJoinRaw = window.sessionStorage.getItem("opinia.pendingPartyJoin");

        if (pendingJoinRaw) {
          try {
            const pendingJoin = JSON.parse(pendingJoinRaw) as { slug?: string };
            if (pendingJoin.slug) {
              router.push(`/dota/teams/${pendingJoin.slug}`, { scroll: false });
              return;
            }
          } catch {
            // Fall through to normal intent routing.
          }
        }

        const intent = searchParams.get("intent");
        const target = searchParams.get("target");

        if (intent === "stack" && target) {
          window.sessionStorage.setItem("opinia.pendingStackSlug", target);
          router.push("/games/search", { scroll: false });
          return;
        }

        if (intent === "search") {
          try {
            await setDotaLfgLooking(true, guestResponse.accessToken);
          } catch {
            // Looking toggle is best-effort after create.
          }
          router.push("/games/search", { scroll: false });
          return;
        }

        router.push(`/dota/${guestResponse.profile.slug}?created=1`, { scroll: false });
        return;
      }

      const profile = await createDotaProfile(profilePayload, accessToken);
      updateAuthSession({ displayName: profile.title });
      trackDotaEvent("dota_profile_created", { slug: profile.slug });
      trackAnalyticsCta("dota_create_submit");

      const pendingJoinRaw = window.sessionStorage.getItem("opinia.pendingPartyJoin");

      if (pendingJoinRaw) {
        try {
          const pendingJoin = JSON.parse(pendingJoinRaw) as { slug?: string };
          if (pendingJoin.slug) {
            router.push(`/dota/teams/${pendingJoin.slug}`, { scroll: false });
            return;
          }
        } catch {
          // Fall through to normal intent routing.
        }
      }

      const intent = searchParams.get("intent");
      const target = searchParams.get("target");

      if (intent === "stack" && target) {
        window.sessionStorage.setItem("opinia.pendingStackSlug", target);
        router.push("/games/search", { scroll: false });
        return;
      }

      if (intent === "search") {
        try {
          await setDotaLfgLooking(true, accessToken);
        } catch {
          // Looking toggle is best-effort after create.
        }
        router.push("/games/search", { scroll: false });
        return;
      }

      router.push(`/dota/${profile.slug}?created=1`, { scroll: false });
    } catch (submitError) {
      if (isDotaProfileAlreadyExistsError(submitError) && accessToken) {
        try {
          const profile = await fetchMyDotaProfile(accessToken);
          router.push(`/dota/${profile.slug}`);
          return;
        } catch {
          setError(resolveDotaFormError(submitError, t, isEditMode ? "update" : "create"));
        }
      } else {
        setError(resolveDotaFormError(submitError, t, isEditMode ? "update" : "create"));
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isAuthSessionLoaded || (authSession && profileLoadState !== "loaded")) {
    return null;
  }

  const submitLabel = authSession
    ? isSubmitting
      ? isEditMode
        ? t("dota.create.submittingUpdate")
        : t("dota.create.submitting")
      : isEditMode
        ? t("dota.create.submitUpdate")
        : t("dota.create.submit")
    : isSubmitting
      ? t("dota.create.submittingGuest")
      : t("dota.create.submitGuest");

  return (
    <div className={`${styles.page}${!isEditMode ? ` ${styles.pageWithArt}` : ""}`}>
      {!isEditMode ? (
        <div aria-hidden="true" className={styles.backdrop}>
          <img
            alt=""
            className={styles.backdropArt}
            decoding="async"
            height={720}
            src="/dota/idle/party-slots-arena.png"
            width={1280}
          />
          <div className={styles.backdropVeil} />
        </div>
      ) : null}

      <section className={`creation-card ${styles.card}`}>
        <header className={styles.header}>
          <h1 className={styles.title}>{isEditMode ? t("dota.create.editTitle") : t("dota.create.title")}</h1>
          {isEditMode && existingProfile ? (
            <>
              <p className={styles.lead}>{t("dota.create.editLead")}</p>
              <Link className="app-nav-link" href={`/dota/${existingProfile.slug}`}>
                {t("dota.create.viewProfile")}
              </Link>
            </>
          ) : null}
        </header>

        <GamesLaunchWaitBanner showSearchLink={!isEditMode} />

        <form className={`form-stack ${styles.form}`} onSubmit={handleSubmit}>
          {authSession ? (
            <div className="signed-in-box">
              <p>{t("auth.signedInLabel")}</p>
              <strong>{authSession.displayName}</strong>
              {authSession.email ? <span>{authSession.email}</span> : null}
              <button className="secondary-button" onClick={signOut} type="button">
                {t("auth.useAnotherAccount")}
              </button>
            </div>
          ) : null}

          <section className={styles.section}>
            {isEditMode ? (
              <label className="field-label">
                {t("dota.create.displayName")}
                <input
                  autoComplete="nickname"
                  maxLength={200}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder={t("dota.create.displayNamePlaceholder")}
                  value={displayName}
                />
                <span className={styles.fieldHint}>{t("dota.create.displayNameHint")}</span>
              </label>
            ) : null}

            <label
              className={`field-label${highlightDotaId ? ` ${styles.fieldHighlight}` : ""}`}
              ref={dotaIdFieldRef}
            >
              {t("dota.create.dotaAccountId")}
              <input
                inputMode="numeric"
                onChange={(event) => setDotaAccountId(event.target.value.replace(/\D/g, ""))}
                pattern="[0-9]{8,10}"
                placeholder="123456789"
                value={dotaAccountId}
              />
              {!isEditMode ? (
                <button
                  className={styles.skipLink}
                  onClick={() => setDotaAccountId("")}
                  type="button"
                >
                  {t("dota.create.dotaAccountIdLater")}
                </button>
              ) : null}
            </label>

            <div className="field-label">
              {t("dota.create.roles")}
              <div className={styles.roleChips}>
                {ROLE_OPTIONS.map((role) => (
                  <label className={styles.roleChip} key={role}>
                    <input
                      checked={roles.includes(role)}
                      onChange={() => toggleRole(role)}
                      type="checkbox"
                    />
                    <span>{role}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="field-label">
              {t("dota.create.mmr")}
              <DotaMmrField
                key={existingProfile?.slug ?? "create"}
                mmrFrom={mmrFrom}
                mmrTo={mmrTo}
                onChange={handleMmrChange}
              />
            </div>
          </section>

          {isEditMode ? (
            <section className={styles.section}>
              <label className="field-label">
                {t("dota.create.server")}
                <select onChange={(event) => setServer(event.target.value as typeof server)} value={server}>
                  {SERVER_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field-label">
                {t("dota.create.gender")}
                <select
                  onChange={(event) =>
                    setGender(event.target.value as "female" | "male" | "unspecified")
                  }
                  value={gender}
                >
                  <option value="unspecified">{t("dota.gender.unspecified")}</option>
                  <option value="female">{t("dota.gender.female")}</option>
                  <option value="male">{t("dota.gender.male")}</option>
                </select>
                <span className={styles.fieldHint}>{t("dota.create.genderHint")}</span>
              </label>

              <label className={styles.checkboxRow}>
                <input
                  checked={hasMic}
                  onChange={(event) => setHasMic(event.target.checked)}
                  type="checkbox"
                />
                <span>{t("dota.create.hasMic")}</span>
              </label>

              <label className="field-label">
                {t("dota.create.playIntent")}
                <select
                  onChange={(event) => setPlayIntent(event.target.value as PlayIntent)}
                  value={playIntent}
                >
                  <option value="fun">{t("dota.create.playIntent.fun")}</option>
                  <option value="ranked">{t("dota.create.playIntent.ranked")}</option>
                  <option value="tournament">{t("dota.create.playIntent.tournament")}</option>
                </select>
              </label>
            </section>
          ) : null}

          <button
            className="primary-button"
            data-analytics="dota_create_submit"
            disabled={isSubmitting}
            type="submit"
          >
            {submitLabel}
          </button>

          {bottomError ? <p className={styles.formError}>{bottomError}</p> : null}
        </form>
      </section>
    </div>
  );
}

function resolveServer(value: string | null): (typeof SERVER_OPTIONS)[number] {
  if (value && SERVER_OPTIONS.includes(value as (typeof SERVER_OPTIONS)[number])) {
    return value as (typeof SERVER_OPTIONS)[number];
  }

  return "EU";
}

function resolveGender(value: string | null): "female" | "male" | "unspecified" {
  if (value === "female" || value === "male" || value === "unspecified") {
    return value;
  }

  return "unspecified";
}

function resolvePlayIntent(value: string | null): PlayIntent {
  if (value === "fun" || value === "ranked" || value === "tournament") {
    return value;
  }

  return "ranked";
}

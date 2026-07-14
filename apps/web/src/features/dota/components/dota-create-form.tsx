"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { ApiError } from "../../../lib/api/api-error";
import { login, register } from "../../auth/api/authenticate";
import { readAuthErrorMessage } from "../../auth/components/minimal-auth-panel";
import { useAuthSession } from "../../auth/hooks/use-auth-session";
import type { AuthResponse } from "../../auth/types/auth";
import { useTranslation } from "../../i18n/locale-provider";
import { createDotaProfile, fetchMyDotaProfile, updateMyDotaProfile } from "../api/dota-api";
import { trackDotaEvent } from "../lib/analytics";
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
import type { DotaProfile } from "../types/dota";
import { DotaCreateIdleReel } from "./dota-create-idle-reel";
import { DotaMmrField } from "./dota-mmr-field";
import styles from "./dota-create-form.module.css";

const ROLE_OPTIONS = ["1", "2", "3", "4", "5"] as const;
const SERVER_OPTIONS = ["EU", "RU", "US", "SEA"] as const;

type AuthMode = "login" | "register";
type PlayIntent = "fun" | "ranked" | "tournament";
type ProfileLoadState = "idle" | "loading" | "loaded";

export function DotaCreateForm() {
  const t = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { authSession, isAuthSessionLoaded, signOut, storeAuthSession } = useAuthSession();
  const dotaIdFieldRef = useRef<HTMLLabelElement | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("register");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [dotaAccountId, setDotaAccountId] = useState("");
  const [mmrFrom, setMmrFrom] = useState("");
  const [mmrTo, setMmrTo] = useState("");
  const [roles, setRoles] = useState<string[]>([]);
  const [server, setServer] = useState<(typeof SERVER_OPTIONS)[number]>("EU");
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
    if (!authSession?.accessToken) {
      if (authMode === "register" && !displayName.trim()) {
        return t("dota.create.validation.displayName");
      }

      if (!email.trim()) {
        return t("dota.create.validation.email");
      }

      if (password.length < 8) {
        return t("dota.create.validation.password");
      }
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
  }, [
    authMode,
    authSession?.accessToken,
    displayName,
    dotaAccountId,
    email,
    hasValidMmr,
    isEditMode,
    password,
    roles.length,
    t
  ]);

  const bottomError = error ?? (showValidation ? validationMessage : null);

  useEffect(() => {
    if (!isAuthSessionLoaded) {
      return;
    }

    if (!authSession?.accessToken) {
      setExistingProfile(null);
      setProfileLoadState("loaded");
      return;
    }

    let isCancelled = false;
    setProfileLoadState("loading");

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

    setDotaAccountId(profile.dotaAccountId);
    setMmrFrom(from);
    setMmrTo(to);
    setRoles(profile.roles);
    setServer(resolveServer(profile.server));
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

  function handleAuthModeChange(nextMode: AuthMode) {
    setAuthMode(nextMode);
    setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setShowValidation(true);

    if (validationMessage) {
      return;
    }

    setIsSubmitting(true);

    let isAuthPhase = !authSession?.accessToken;
    let accessToken = authSession?.accessToken;
    let pendingAuthResponse: AuthResponse | null = null;

    try {
      if (!accessToken) {
        const authResponse =
          authMode === "register"
            ? await register({
                displayName: displayName.trim(),
                email: email.trim(),
                password
              })
            : await login({
                email: email.trim(),
                password
              });

        pendingAuthResponse = authResponse;
        accessToken = authResponse.accessToken;
        isAuthPhase = false;
      }

      const mmr = formatDotaMmrRange(mmrFrom, mmrTo);
      const trimmedDotaAccountId = dotaAccountId.trim();

      if (isEditMode) {
        const profile = await updateMyDotaProfile(
          {
            ...(trimmedDotaAccountId ? { dotaAccountId: trimmedDotaAccountId } : {}),
            hasMic,
            ...(mmr ? { mmr } : {}),
            playIntent,
            roles,
            server
          },
          accessToken
        );

        trackDotaEvent("dota_profile_updated", { slug: profile.slug });
        router.push(`/dota/${profile.slug}`);
        return;
      }

      if (!mmr) {
        setError(t("dota.create.mmrRequired"));
        return;
      }

      const profile = await createDotaProfile(
        {
          ...(trimmedDotaAccountId ? { dotaAccountId: trimmedDotaAccountId } : {}),
          hasMic,
          mmr,
          playIntent,
          roles,
          server
        },
        accessToken
      );

      if (pendingAuthResponse) {
        storeAuthSession(pendingAuthResponse);
      }

      trackDotaEvent("dota_profile_created", { slug: profile.slug });
      router.push(`/dota/${profile.slug}?created=1`, { scroll: false });
    } catch (submitError) {
      if (pendingAuthResponse) {
        storeAuthSession(pendingAuthResponse);
      }

      if (isAuthPhase) {
        setError(readAuthErrorMessage(submitError, authMode, t));
      } else if (isDotaProfileAlreadyExistsError(submitError) && accessToken) {
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
      ? t("dota.create.submittingCombined")
      : authMode === "register"
        ? t("dota.create.submitRegister")
        : t("dota.create.submitLogin");

  return (
    <div className={styles.page}>
      <section className={`creation-card ${styles.card}`}>
        <header className={styles.header}>
          <h1 className={styles.title}>{isEditMode ? t("dota.create.editTitle") : t("dota.create.title")}</h1>
          {isEditMode ? <p className={styles.lead}>{t("dota.create.editLead")}</p> : null}
        </header>

        <form className={`form-stack ${styles.form}`} onSubmit={handleSubmit}>
          {authSession ? (
            <div className="signed-in-box">
              <p>{t("auth.signedInLabel")}</p>
              <strong>{authSession.displayName}</strong>
              <span>{authSession.email}</span>
              <button className="secondary-button" onClick={signOut} type="button">
                {t("auth.useAnotherAccount")}
              </button>
            </div>
          ) : (
            <section className={styles.section}>
              <div className="segmented-control" aria-label={t("auth.mode.ariaLabel")}>
                <button
                  aria-pressed={authMode === "register"}
                  onClick={() => handleAuthModeChange("register")}
                  type="button"
                >
                  {t("auth.mode.register")}
                </button>
                <button
                  aria-pressed={authMode === "login"}
                  onClick={() => handleAuthModeChange("login")}
                  type="button"
                >
                  {t("auth.mode.login")}
                </button>
              </div>

              <div
                aria-hidden={authMode !== "register"}
                className={`auth-display-name-slot${authMode === "register" ? " is-visible" : ""}`}
              >
                <div className="auth-display-name-slot__inner">
                  <label className="field-label">
                    {t("auth.field.displayName")}
                    <input
                      autoComplete="name"
                      maxLength={100}
                      minLength={1}
                      onChange={(event) => setDisplayName(event.target.value)}
                      required={authMode === "register"}
                      tabIndex={authMode === "register" ? 0 : -1}
                      value={displayName}
                    />
                  </label>
                </div>
              </div>

              <label className="field-label">
                {t("auth.field.email")}
                <input
                  autoComplete="email"
                  maxLength={320}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  type="email"
                  value={email}
                />
              </label>

              <label className="field-label">
                {t("auth.field.password")}
                <input
                  autoComplete={authMode === "register" ? "new-password" : "current-password"}
                  maxLength={128}
                  minLength={8}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  type="password"
                  value={password}
                />
              </label>
            </section>
          )}

          <section className={styles.section}>
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

          <button className="primary-button" disabled={isSubmitting} type="submit">
            {submitLabel}
          </button>

          {bottomError ? <p className={styles.formError}>{bottomError}</p> : null}
        </form>
      </section>

      {!isEditMode ? <DotaCreateIdleReel /> : null}
    </div>
  );
}

function resolveServer(value: string | null): (typeof SERVER_OPTIONS)[number] {
  if (value && SERVER_OPTIONS.includes(value as (typeof SERVER_OPTIONS)[number])) {
    return value as (typeof SERVER_OPTIONS)[number];
  }

  return "EU";
}

function resolvePlayIntent(value: string | null): PlayIntent {
  if (value === "fun" || value === "ranked" || value === "tournament") {
    return value;
  }

  return "ranked";
}

"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

import { useAuthSession } from "../../auth/hooks/use-auth-session";
import type { AuthResponse } from "../../auth/types/auth";
import { useTranslation } from "../../i18n/locale-provider";
import {
  createDotaProfile,
  createGuestDotaProfile,
  fetchMyDotaProfile
} from "../api/dota-api";
import {
  formatDotaMmrRange,
  getDotaPositionLabel,
  isValidDotaMmrInput,
  resolveDotaMmrMode
} from "../lib/labels";
import { stashDotaRecovery } from "../lib/recovery-storage";
import type { DotaPositionRole } from "../../social/types/social";
import { DotaMmrField } from "./dota-mmr-field";
import styles from "./party-auth-sheet.module.css";

const ROLE_POSITIONS = ["1", "2", "3", "4", "5"] as const satisfies readonly DotaPositionRole[];

type SheetPhase = "checking" | "mmr" | "roles" | "creating";

interface PartyAuthSheetProps {
  onAuthSuccess: (authResponse: AuthResponse) => void;
  onClose: () => void;
  open: boolean;
  preferredRole?: DotaPositionRole | null;
}

export function PartyAuthSheet({
  onAuthSuccess,
  onClose,
  open,
  preferredRole = null
}: PartyAuthSheetProps) {
  const t = useTranslation();
  const { authSession, isAuthSessionLoaded, storeAuthSession } = useAuthSession();
  const [phase, setPhase] = useState<SheetPhase>("checking");
  const [mmrFrom, setMmrFrom] = useState("");
  const [mmrTo, setMmrTo] = useState("");
  const [roles, setRoles] = useState<DotaPositionRole[]>([]);
  const [error, setError] = useState<string | null>(null);
  const completedRef = useRef(false);
  const bootstrappedOpenRef = useRef(false);
  const onAuthSuccessRef = useRef(onAuthSuccess);
  onAuthSuccessRef.current = onAuthSuccess;

  useEffect(() => {
    if (!open) {
      completedRef.current = false;
      bootstrappedOpenRef.current = false;
      setPhase("checking");
      setMmrFrom("");
      setMmrTo("");
      setRoles([]);
      setError(null);
      return;
    }

    if (!isAuthSessionLoaded || bootstrappedOpenRef.current || completedRef.current) {
      return;
    }

    bootstrappedOpenRef.current = true;
    let cancelled = false;

    async function bootstrap() {
      setPhase("checking");
      setError(null);

      if (preferredRole) {
        setRoles([preferredRole]);
      }

      if (!authSession?.accessToken) {
        if (!cancelled) {
          setPhase("mmr");
        }
        return;
      }

      try {
        await fetchMyDotaProfile(authSession.accessToken);
        if (cancelled || completedRef.current) {
          return;
        }

        completedRef.current = true;
        onAuthSuccessRef.current({
          accessToken: authSession.accessToken,
          expiresIn: 0,
          tokenType: "Bearer",
          user: {
            avatarUrl: authSession.avatarUrl,
            displayName: authSession.displayName,
            email: authSession.email,
            id: authSession.userId
          }
        });
      } catch {
        if (cancelled || completedRef.current) {
          return;
        }

        setPhase("mmr");
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [
    authSession?.accessToken,
    authSession?.avatarUrl,
    authSession?.displayName,
    authSession?.email,
    authSession?.userId,
    isAuthSessionLoaded,
    open,
    preferredRole
  ]);

  if (!open) {
    return null;
  }

  function toggleRole(role: DotaPositionRole) {
    setRoles((current) =>
      current.includes(role) ? current.filter((item) => item !== role) : [...current, role]
    );
    setError(null);
  }

  function submitMmr(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isValidDotaMmrInput(mmrFrom, mmrTo, resolveDotaMmrMode(mmrFrom, mmrTo))) {
      setError(t("games.search.cinematic.mmrError"));
      return;
    }
    setError(null);
    setPhase("roles");
  }

  async function submitRoles(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (roles.length === 0) {
      setError(t("games.search.cinematic.rolesError"));
      return;
    }

    const mmr = formatDotaMmrRange(mmrFrom, mmrTo);
    if (!mmr) {
      setError(t("games.search.cinematic.mmrError"));
      setPhase("mmr");
      return;
    }

    setPhase("creating");
    setError(null);

    try {
      if (authSession?.accessToken) {
        await createDotaProfile({ mmr, roles }, authSession.accessToken);
        completedRef.current = true;
        onAuthSuccessRef.current({
          accessToken: authSession.accessToken,
          expiresIn: 0,
          tokenType: "Bearer",
          user: {
            avatarUrl: authSession.avatarUrl,
            displayName: authSession.displayName,
            email: authSession.email,
            id: authSession.userId
          }
        });
        return;
      }

      const response = await createGuestDotaProfile({ mmr, roles });
      const authResponse: AuthResponse = {
        accessToken: response.accessToken,
        expiresIn: response.expiresIn,
        tokenType: response.tokenType,
        user: {
          avatarUrl: response.user.avatarUrl ?? null,
          displayName: response.user.displayName,
          email: response.user.email,
          id: response.user.id
        }
      };
      completedRef.current = true;
      storeAuthSession(authResponse);
      stashDotaRecovery({
        recoveryToken: response.recoveryToken,
        recoveryUrl: response.recoveryUrl,
        slug: response.profile.slug
      });
      onAuthSuccessRef.current(authResponse);
    } catch {
      setError(t("dota.team.authSheetCreateError"));
      setPhase("roles");
    }
  }

  return (
    <div
      aria-labelledby="party-auth-title"
      aria-modal="true"
      className={styles.overlay}
      role="dialog"
    >
      <div className={styles.sheet}>
        <button className={styles.close} onClick={onClose} type="button">
          {t("dota.team.shareWallClose")}
        </button>

        {phase === "checking" || phase === "creating" ? (
          <div className={styles.creating} aria-live="polite">
            <span aria-hidden className={styles.spinner} />
            <p className={styles.eyebrow} id="party-auth-title">
              {t("dota.team.authSheetEyebrow")}
            </p>
            <h2 className={styles.title}>
              {phase === "creating"
                ? t("games.search.cinematic.preparing")
                : t("common.loadingEllipsis")}
            </h2>
            {phase === "creating" ? (
              <p className={styles.lead}>{t("dota.team.authSheetCreatingHint")}</p>
            ) : null}
          </div>
        ) : null}

        {phase === "mmr" ? (
          <form className={styles.step} onSubmit={submitMmr}>
            <p className={styles.eyebrow} id="party-auth-title">
              {t("dota.team.authSheetEyebrow")}
            </p>
            <h2 className={styles.title}>{t("games.search.cinematic.askMmr")}</h2>
            <p className={styles.lead}>{t("dota.team.authSheetLead")}</p>
            <DotaMmrField
              mmrFrom={mmrFrom}
              mmrTo={mmrTo}
              onChange={(from, to) => {
                setMmrFrom(from);
                setMmrTo(to);
                setError(null);
              }}
            />
            <button className={styles.primary} type="submit">
              {t("games.search.cinematic.next")}
              <span aria-hidden>→</span>
            </button>
          </form>
        ) : null}

        {phase === "roles" ? (
          <form className={styles.step} onSubmit={(event) => void submitRoles(event)}>
            <p className={styles.eyebrow} id="party-auth-title">
              {t("dota.team.authSheetEyebrow")}
            </p>
            <h2 className={styles.title}>{t("games.search.cinematic.askRoles")}</h2>
            <p className={styles.lead}>{t("games.search.cinematic.askRolesHint")}</p>
            <div
              aria-label={t("games.search.cinematic.yourRoles")}
              className={styles.rolePicker}
              role="group"
            >
              {ROLE_POSITIONS.map((role) => (
                <button
                  aria-pressed={roles.includes(role)}
                  className={`${styles.roleButton}${
                    roles.includes(role) ? ` ${styles.roleButtonActive}` : ""
                  }`}
                  key={role}
                  onClick={() => toggleRole(role)}
                  title={getDotaPositionLabel(role, t)}
                  type="button"
                >
                  <strong>{role}</strong>
                  <span>{getDotaPositionLabel(role, t)}</span>
                </button>
              ))}
            </div>
            <div className={styles.actions}>
              <button
                className={styles.back}
                onClick={() => {
                  setError(null);
                  setPhase("mmr");
                }}
                type="button"
              >
                {t("games.search.cinematic.back")}
              </button>
              <button className={styles.primary} type="submit">
                {t("dota.team.authSheetFinish")}
                <span aria-hidden>→</span>
              </button>
            </div>
          </form>
        ) : null}

        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

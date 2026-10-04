"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { FormFeedback } from "../../../components/form-feedback";
import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { useTranslation } from "../../i18n/locale-provider";
import { getCurrentUserProfile } from "../../profile/api/profile";
import {
  searchAdminUsers,
  setAdminTournamentModerator,
  type AdminManagedUser
} from "../api/admin-tournament-moderators-api";
import styles from "./admin-tournament-moderators-view.module.css";

export function AdminTournamentModeratorsView() {
  const t = useTranslation();
  const router = useRouter();
  const { authSession, isAuthSessionLoaded } = useAuthSession();
  const [isAdmin, setIsAdmin] = useState(false);
  const [permissionLoading, setPermissionLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<AdminManagedUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthSessionLoaded) return;
    if (!authSession?.accessToken) {
      router.replace("/profile");
      setPermissionLoading(false);
      return;
    }
    let active = true;
    void getCurrentUserProfile(authSession.accessToken)
      .then((profile) => {
        if (!active) return;
        setIsAdmin(profile.role === "ADMIN");
      })
      .catch(() => {
        if (active) setError(t("dota.tournaments.moderators.error"));
      })
      .finally(() => {
        if (active) setPermissionLoading(false);
      });
    return () => {
      active = false;
    };
  }, [authSession?.accessToken, isAuthSessionLoaded, router, t]);

  useEffect(() => {
    if (!isAdmin || !authSession?.accessToken) return;
    const normalized = query.trim();
    if (normalized.length < 2) {
      setUsers([]);
      setSearching(false);
      return;
    }
    let active = true;
    const timeout = window.setTimeout(() => {
      setSearching(true);
      setError(null);
      void searchAdminUsers(normalized, authSession.accessToken!)
        .then((result) => {
          if (active) setUsers(result);
        })
        .catch(() => {
          if (active) setError(t("dota.tournaments.moderators.searchError"));
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [authSession?.accessToken, isAdmin, query, t]);

  async function toggleModerator(user: AdminManagedUser) {
    if (!authSession?.accessToken || busyUserId || user.role === "ADMIN") return;
    const enabled = user.role !== "TOURNAMENT_MODERATOR";
    if (!window.confirm(t(enabled
      ? "dota.tournaments.moderators.confirmGrant"
      : "dota.tournaments.moderators.confirmRevoke", { name: user.displayName }))) return;

    setBusyUserId(user.id);
    setError(null);
    setFeedback(null);
    try {
      const updated = await setAdminTournamentModerator(user.id, enabled, authSession.accessToken);
      setUsers((current) => current.map((item) => item.id === updated.id ? updated : item));
      setFeedback(t(enabled
        ? "dota.tournaments.moderators.granted"
        : "dota.tournaments.moderators.revoked", { name: updated.displayName }));
    } catch {
      setError(t("dota.tournaments.moderators.error"));
    } finally {
      setBusyUserId(null);
    }
  }

  if (!isAuthSessionLoaded || permissionLoading) return <p>{t("common.loadingEllipsis")}</p>;
  if (!isAdmin) {
    return (
      <section className={styles.page}>
        <h1>{t("admin.accessDeniedTitle")}</h1>
        <p>{t("admin.accessDeniedBody")}</p>
        <Link className="button-secondary" href="/admin">{t("admin.backToProfile")}</Link>
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <Link href="/admin">← {t("admin.title")}</Link>
        <h1>{t("dota.tournaments.moderators.title")}</h1>
        <p>{t("dota.tournaments.moderators.description")}</p>
      </header>
      <FormFeedback errorMessage={error} statusMessage={feedback} />
      <label className={styles.searchLabel}>
        {t("dota.tournaments.moderators.searchLabel")}
        <input
          autoComplete="off"
          maxLength={100}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("dota.tournaments.moderators.searchPlaceholder")}
          value={query}
        />
      </label>
      {query.trim().length < 2 ? <p className={styles.muted}>{t("dota.tournaments.moderators.searchHint")}</p> : null}
      {searching ? <p className={styles.muted}>{t("common.loadingEllipsis")}</p> : null}
      {!searching && query.trim().length >= 2 && users.length === 0 ? (
        <p className={styles.muted}>{t("dota.tournaments.moderators.noUsers")}</p>
      ) : null}
      <div className={styles.userList}>
        {users.map((user) => (
          <article className={styles.userCard} key={user.id}>
            <div className={styles.userDetails}>
              <strong>{user.displayName}</strong>
              <span>{user.username ? `@${user.username}` : t("dota.tournaments.moderators.noUsername")}</span>
              <small>{user.id.slice(0, 8)}</small>
            </div>
            <div className={styles.userActions}>
              <span className={styles.role}>{t(`dota.tournaments.moderators.role.${user.role}` as never)}</span>
              {user.role === "ADMIN" ? (
                <span className={styles.muted}>{t("dota.tournaments.moderators.adminProtected")}</span>
              ) : (
                <button
                  className={user.role === "TOURNAMENT_MODERATOR" ? "button-secondary" : "button-primary"}
                  disabled={busyUserId !== null}
                  onClick={() => void toggleModerator(user)}
                  type="button"
                >
                  {busyUserId === user.id
                    ? t("common.loadingEllipsis")
                    : t(user.role === "TOURNAMENT_MODERATOR"
                      ? "dota.tournaments.moderators.revoke"
                      : "dota.tournaments.moderators.grant")}
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

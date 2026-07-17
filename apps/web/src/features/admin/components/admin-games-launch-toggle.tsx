"use client";

import { useCallback, useEffect, useState } from "react";

import { useAuthSession } from "../../auth/hooks/use-auth-session";
import {
  fetchAdminGamesLaunchStatus,
  updateAdminGamesLaunch,
  type GamesLaunchStatus
} from "../../games/api/games-launch-api";
import { useTranslation } from "../../i18n/locale-provider";
import styles from "./admin-games-launch-toggle.module.css";

export function AdminGamesLaunchToggle() {
  const t = useTranslation();
  const { authSession } = useAuthSession();
  const accessToken = authSession?.accessToken;
  const [status, setStatus] = useState<GamesLaunchStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    try {
      const next = await fetchAdminGamesLaunchStatus(accessToken);
      setStatus(next);
      setError(null);
    } catch {
      setError(t("games.launch.admin.error"));
    }
  }, [accessToken, t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function toggle(searchLive: boolean) {
    if (!accessToken || busy) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const next = await updateAdminGamesLaunch(searchLive, accessToken);
      setStatus(next);
    } catch {
      setError(t("games.launch.admin.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.panel}>
      <div className={styles.copy}>
        <h2 className={styles.title}>{t("games.launch.admin.title")}</h2>
        <p className={styles.lead}>{t("games.launch.admin.lead")}</p>
        <p className={styles.state}>
          {status?.searchLive
            ? t("games.launch.admin.stateOn")
            : t("games.launch.admin.stateOff")}
        </p>
      </div>
      <div className={styles.actions}>
        <button
          className="button-primary"
          disabled={busy || status?.searchLive === true}
          onClick={() => void toggle(true)}
          type="button"
        >
          {t("games.launch.admin.open")}
        </button>
        <button
          className="button-secondary"
          disabled={busy || status?.searchLive === false}
          onClick={() => void toggle(false)}
          type="button"
        >
          {t("games.launch.admin.close")}
        </button>
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}
    </section>
  );
}

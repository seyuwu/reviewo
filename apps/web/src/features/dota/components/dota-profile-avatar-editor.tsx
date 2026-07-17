"use client";

import { useEffect, useState } from "react";

import { FormFeedback } from "../../../components/form-feedback";
import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { useTranslation } from "../../i18n/locale-provider";
import { updateCurrentUserAvatar } from "../../profile/api/profile";
import { fileToAvatarDataUrl } from "../../profile/lib/resize-avatar";
import styles from "./dota-profile-avatar-editor.module.css";

interface DotaProfileAvatarEditorProps {
  displayName: string;
}

export function DotaProfileAvatarEditor({ displayName }: DotaProfileAvatarEditorProps) {
  const t = useTranslation();
  const { authSession, updateAuthSession } = useAuthSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const avatarUrl = previewUrl ?? authSession?.avatarUrl ?? null;
  const initial = displayName.trim().charAt(0).toUpperCase() || "?";

  useEffect(() => {
    if (authSession?.avatarUrl) {
      setPreviewUrl(authSession.avatarUrl);
    }
  }, [authSession?.avatarUrl]);

  async function handleAvatarChange(file: File | null) {
    if (!file || !authSession?.accessToken) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const imageDataUrl = await fileToAvatarDataUrl(file);
      const updated = await updateCurrentUserAvatar(imageDataUrl, authSession.accessToken);
      const nextAvatar = updated.avatarUrl ?? imageDataUrl;
      setPreviewUrl(nextAvatar);
      updateAuthSession({ avatarUrl: nextAvatar });
    } catch {
      setError(t("web.profile.avatarError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <span className={styles.avatar} aria-hidden="true">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt="" className={styles.avatarImage} src={avatarUrl} />
        ) : (
          initial
        )}
      </span>
      <div className={styles.copy}>
        <strong>{t("web.profile.avatarTitle")}</strong>
        <label className={styles.upload}>
          <input
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              event.target.value = "";
              void handleAvatarChange(file);
            }}
            type="file"
          />
          {busy ? t("web.profile.avatarBusy") : t("web.profile.avatarChange")}
        </label>
        {error ? <FormFeedback errorMessage={error} /> : null}
      </div>
    </div>
  );
}

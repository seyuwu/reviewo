"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { useTranslation } from "../../i18n/locale-provider";
import { fetchEditorStats } from "../../admin/api/admin-contributions-api";

interface ProfileEditorStatsSectionProps {
  accessToken: string;
}

export function ProfileEditorStatsSection({ accessToken }: ProfileEditorStatsSectionProps) {
  const t = useTranslation();
  const editorStatsQuery = useQuery({
    queryFn: () => fetchEditorStats(accessToken),
    queryKey: ["editor-stats", accessToken]
  });

  const stats = editorStatsQuery.data;

  if (editorStatsQuery.isLoading) {
    return (
      <div className="panel-card profile-panel">
        <p className="muted-copy">{t("common.loadingEllipsis")}</p>
      </div>
    );
  }

  if (editorStatsQuery.isError || !stats) {
    return null;
  }

  const scoreLabel =
    stats.editorScorePercent === null
      ? t("web.profile.editorScoreEmpty")
      : t("web.profile.editorScoreValue", { score: String(stats.editorScorePercent) });

  return (
    <div className="panel-card profile-panel">
      <div className="section-heading">
        <p className="result-type">{t("web.profile.editorStatsEyebrow")}</p>
        <h2>{t("web.profile.editorStatsTitle")}</h2>
      </div>

      <div className="profile-fields">
        <div className="profile-field">
          <span>{t("web.profile.editorStatsSubmitted")}</span>
          <strong>{stats.totalSubmitted}</strong>
        </div>
        <div className="profile-field">
          <span>{t("web.profile.editorStatsApplied")}</span>
          <strong>{stats.appliedCount}</strong>
        </div>
        <div className="profile-field">
          <span>{t("web.profile.editorStatsRejected")}</span>
          <strong>{stats.rejectedCount}</strong>
        </div>
        <div className="profile-field">
          <span>{t("web.profile.editorStatsPending")}</span>
          <strong>{stats.pendingCount}</strong>
        </div>
        <div className="profile-field">
          <span>{t("web.profile.editorStatsScore")}</span>
          <strong>{scoreLabel}</strong>
        </div>
      </div>
    </div>
  );
}

interface ProfileAdminLinkProps {
  isAdmin: boolean;
}

export function ProfileAdminLink({ isAdmin }: ProfileAdminLinkProps) {
  const t = useTranslation();

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="profile-actions">
      <Link className="button-secondary" href="/admin">
        {t("admin.openPanel")}
      </Link>
    </div>
  );
}

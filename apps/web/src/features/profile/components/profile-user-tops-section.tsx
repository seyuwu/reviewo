"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { useTranslation } from "../../i18n/locale-provider";
import { fetchTopsByAuthor } from "../../tops/api/tops-api";
import { TopsList } from "../../tops/components/tops-list";

interface ProfileUserTopsSectionProps {
  userId: string;
}

export function ProfileUserTopsSection({ userId }: ProfileUserTopsSectionProps) {
  const t = useTranslation();

  const userTopsQuery = useQuery({
    queryFn: () => fetchTopsByAuthor(userId),
    queryKey: ["user-tops", userId]
  });

  return (
    <div className="panel-card profile-panel profile-user-tops-section">
      <header className="panel-header">
        <h2>{t("web.profile.myTopsTitle")}</h2>
        <div className="profile-actions">
          <Link className="button-primary" href="/tops/new">
            {t("web.profile.myTopsCreate")}
          </Link>
        </div>
      </header>

      {userTopsQuery.isLoading ? (
        <p className="muted-copy">{t("chat.loading")}</p>
      ) : (
        <TopsList
          emptyMessage={t("web.profile.myTopsEmpty")}
          items={userTopsQuery.data?.items ?? []}
          showAuthor={false}
        />
      )}

      <div className="profile-actions profile-user-tops-footer">
        <Link className="button-secondary" href="/tops">
          {t("web.userTops.hubTitle")}
        </Link>
      </div>
    </div>
  );
}

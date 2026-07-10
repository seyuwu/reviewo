"use client";

import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { ContentLocaleToggle } from "../../i18n/content-locale-toggle";
import { useLocale, useTranslation } from "../../i18n/locale-provider";
import { fetchTopsByAuthor } from "../../tops/api/tops-api";
import { TopsList } from "../../tops/components/tops-list";

interface ProfileUserTopsSectionProps {
  userId: string;
}

export function ProfileUserTopsSection({ userId }: ProfileUserTopsSectionProps) {
  const t = useTranslation();
  const { resolvedLocale } = useLocale();
  const [showAllTops, setShowAllTops] = useState(false);
  const contentLocale = showAllTops ? "all" : resolvedLocale;

  const userTopsQuery = useQuery({
    queryFn: () => fetchTopsByAuthor(userId, 20, undefined, contentLocale),
    queryKey: ["user-tops", userId, contentLocale],
    placeholderData: keepPreviousData
  });

  const topsItems = userTopsQuery.data?.items ?? [];
  const showLoading = userTopsQuery.isLoading && topsItems.length === 0;

  return (
    <div className="panel-card profile-panel profile-user-tops-section">
      <header className="panel-header">
        <h2>{t("web.profile.myTopsTitle")}</h2>
        <div className="profile-actions">
          <ContentLocaleToggle
            locale={resolvedLocale}
            showAll={showAllTops}
            onToggle={() => {
              setShowAllTops((current) => !current);
            }}
          />
          <Link className="button-primary" href="/tops/new">
            {t("web.profile.myTopsCreate")}
          </Link>
        </div>
      </header>

      {showLoading ? (
        <p className="muted-copy">{t("chat.loading")}</p>
      ) : (
        <TopsList
          emptyMessage={t("web.profile.myTopsEmpty")}
          items={topsItems}
          showAuthor={false}
          showLocaleBadge={contentLocale === "all"}
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

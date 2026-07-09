"use client";

import Link from "next/link";

import { useTranslation } from "../../i18n/locale-provider";

export type TopHubTab = "ratings" | "catalog" | "user";

interface TopHubTabsProps {
  activeTab: TopHubTab;
  onSelectCatalog?: () => void;
  onSelectRatings?: () => void;
}

export function TopHubTabs({ activeTab, onSelectCatalog, onSelectRatings }: TopHubTabsProps) {
  const t = useTranslation();

  return (
    <div className="home-hub-tabs home-hub-tabs-3" role="tablist" aria-label={t("web.topsPage.title")}>
      {activeTab === "ratings" ? (
        <button type="button" className="home-hub-tab" role="tab" aria-selected={true}>
          {t("web.topsPage.tabRatings")}
        </button>
      ) : onSelectRatings ? (
        <button
          type="button"
          className="home-hub-tab"
          role="tab"
          aria-selected={false}
          onClick={onSelectRatings}
        >
          {t("web.topsPage.tabRatings")}
        </button>
      ) : (
        <Link className="home-hub-tab home-hub-tab-link" href="/top" role="tab" aria-selected={false}>
          {t("web.topsPage.tabRatings")}
        </Link>
      )}

      {activeTab === "catalog" ? (
        <button type="button" className="home-hub-tab" role="tab" aria-selected={true}>
          {t("web.topsPage.tabCatalog")}
        </button>
      ) : onSelectCatalog ? (
        <button
          type="button"
          className="home-hub-tab"
          role="tab"
          aria-selected={false}
          onClick={onSelectCatalog}
        >
          {t("web.topsPage.tabCatalog")}
        </button>
      ) : (
        <Link
          className="home-hub-tab home-hub-tab-link"
          href="/top?tab=catalog"
          role="tab"
          aria-selected={false}
        >
          {t("web.topsPage.tabCatalog")}
        </Link>
      )}

      {activeTab === "user" ? (
        <button type="button" className="home-hub-tab" role="tab" aria-selected={true}>
          {t("web.topsPage.tabUserTops")}
        </button>
      ) : (
        <Link className="home-hub-tab home-hub-tab-link" href="/tops" role="tab" aria-selected={false}>
          {t("web.topsPage.tabUserTops")}
        </Link>
      )}
    </div>
  );
}

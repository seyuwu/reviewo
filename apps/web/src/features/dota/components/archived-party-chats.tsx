"use client";

import { useInfiniteQuery, type InfiniteData } from "@tanstack/react-query";
import { useState } from "react";

import { useTranslation } from "../../i18n/locale-provider";
import { fetchPartyChatArchives, type PartyChatArchivesPage } from "../api/admin-parties-api";
import { AdminPartyChat } from "./admin-party-chat";
import styles from "./all-parties-view.module.css";

export function ArchivedPartyChats({ accessToken }: { accessToken: string }) {
  const t = useTranslation();
  const [selected, setSelected] = useState<string | null>(null);
  const archives = useInfiniteQuery<
    PartyChatArchivesPage,
    Error,
    InfiniteData<PartyChatArchivesPage>,
    readonly unknown[],
    string | undefined
  >({
    initialPageParam: undefined,
    queryFn: ({ pageParam }) => fetchPartyChatArchives(accessToken, pageParam),
    queryKey: ["party-chat-archives", accessToken],
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false
  });
  const items = archives.isError
    ? []
    : [
        ...new Map(
          archives.data?.pages.flatMap((page) => page.items).map((item) => [item.id, item])
        ).values()
      ];
  const date = (value: string) =>
    new Date(value).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
  return (
    <>
      <div className={styles.header}>
        <p className="muted-copy">{t("dota.allParties.archiveDescription")}</p>
        <button
          className="button-secondary"
          type="button"
          disabled={archives.isFetching}
          onClick={() => void archives.refetch()}
        >
          {t("dota.allParties.refresh")}
        </button>
      </div>
      {archives.isPending ? <p>{t("common.loadingEllipsis")}</p> : null}
      {archives.isError ? <p role="alert">{t("dota.allParties.loadError")}</p> : null}
      {archives.isSuccess && !items.length ? (
        <div className={`panel-card ${styles.empty}`}>{t("dota.allParties.archivesEmpty")}</div>
      ) : null}
      <div className={styles.grid}>
        {items.map((archive) => (
          <article className={`panel-card ${styles.card}`} key={archive.id}>
            <div className={styles.cardHeader}>
              <h2>{archive.name}</h2>
            </div>
            <div className={styles.dates}>
              <span>{t("dota.allParties.archivedAt", { date: date(archive.archivedAt) })}</span>
              <span>{t("dota.allParties.archiveExpires", { date: date(archive.expiresAt) })}</span>
            </div>
            <button
              className={`button-secondary ${styles.open}`}
              type="button"
              aria-expanded={selected === archive.id}
              onClick={() => setSelected(selected === archive.id ? null : archive.id)}
            >
              {t(
                selected === archive.id ? "dota.allParties.closeChat" : "dota.allParties.openChat"
              )}
            </button>
            {selected === archive.id ? (
              <div className={styles.archiveChat}>
                <AdminPartyChat key={archive.id} partyId={archive.id} fallback={null} archived />
              </div>
            ) : null}
          </article>
        ))}
      </div>
      {archives.hasNextPage ? (
        <button
          className={`button-secondary ${styles.more}`}
          type="button"
          disabled={archives.isFetching}
          onClick={() => void archives.fetchNextPage()}
        >
          {t("dota.allParties.more")}
        </button>
      ) : null}
    </>
  );
}

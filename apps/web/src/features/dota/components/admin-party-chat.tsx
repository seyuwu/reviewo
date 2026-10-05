"use client";

import { useInfiniteQuery, type InfiniteData } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";

import { useTranslation } from "../../i18n/locale-provider";
import type { GamePartyChatMessagesPage } from "../../social/types/social";
import { fetchAdminPartyChat, fetchArchivedPartyChat } from "../api/admin-parties-api";
import { usePartyAdminAccess } from "../hooks/use-party-admin-access";
import styles from "./admin-party-chat.module.css";

export function AdminPartyChat({
  partyId,
  fallback,
  archived = false
}: {
  partyId: string;
  fallback: ReactNode;
  archived?: boolean;
}) {
  const t = useTranslation();
  const { accessToken, isAdmin } = usePartyAdminAccess();
  const listRef = useRef<HTMLDivElement>(null);
  const initialScrollDone = useRef(false);
  const chat = useInfiniteQuery<
    GamePartyChatMessagesPage,
    Error,
    InfiniteData<GamePartyChatMessagesPage>,
    readonly unknown[],
    string | undefined
  >({
    enabled: isAdmin,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      (archived ? fetchArchivedPartyChat : fetchAdminPartyChat)(
        partyId,
        accessToken ?? "",
        pageParam
      ),
    queryKey: ["admin-party-chat", accessToken, partyId, archived],
    refetchOnWindowFocus: false,
    gcTime: 0,
    retry: false
  });
  useEffect(() => {
    if (!isAdmin || !chat.data || !listRef.current || initialScrollDone.current) return;
    initialScrollDone.current = true;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [chat.data, isAdmin]);
  if (!isAdmin) return fallback;
  const messages = chat.isError
    ? []
    : [
        ...new Map(
          chat.data?.pages
            .slice()
            .reverse()
            .flatMap((page) => page.messages)
            .map((message) => [message.id, message])
        ).values()
      ];
  const displayMessage = (value: string) => {
    if (value === "__system__:party_safety") return t("dota.team.system.party_safety");
    if (value === "__system__:party_merged") return t("dota.team.system.party_merged");
    if (value === "__system__:discord_voice_ready")
      return t("dota.team.system.discord_voice_ready");
    return value;
  };
  return (
    <aside className={styles.panel} aria-label={t("dota.team.chatTitle")}>
      <header className={styles.header}>
        <h2>{t("dota.team.chatTitle")}</h2>
        <p>{t("dota.allParties.readOnly")}</p>
        <div className={styles.actions}>
          <Link href="/games/parties">{t("dota.allParties.title")}</Link>
          <button
            className="button-secondary"
            disabled={chat.isFetching}
            onClick={() => void chat.refetch()}
            type="button"
          >
            {t("dota.allParties.refresh")}
          </button>
        </div>
      </header>
      <div className={styles.messages} ref={listRef} tabIndex={0}>
        {chat.hasNextPage ? (
          <button
            className="button-secondary"
            disabled={chat.isFetching}
            onClick={() => void chat.fetchNextPage()}
            type="button"
          >
            {t("dota.allParties.olderMessages")}
          </button>
        ) : null}
        {chat.isPending ? <p>{t("common.loadingEllipsis")}</p> : null}
        {chat.isError ? (
          <p role="alert">
            {t(archived ? "dota.allParties.archiveError" : "dota.allParties.chatError")}
          </p>
        ) : null}
        {chat.isSuccess && messages.length === 0 ? <p>{t("dota.team.chatEmpty")}</p> : null}
        {messages.map((message) => (
          <article className={styles.message} key={message.id}>
            <div className={styles.meta}>
              <strong>
                {[
                  "__system__:party_safety",
                  "__system__:party_merged",
                  "__system__:discord_voice_ready"
                ].includes(message.message)
                  ? t("dota.allParties.system")
                  : message.displayName}
              </strong>
              <time dateTime={message.createdAt}>
                {new Date(message.createdAt).toLocaleString(undefined, {
                  dateStyle: "short",
                  timeStyle: "short"
                })}
              </time>
            </div>
            <p>{displayMessage(message.message)}</p>
          </article>
        ))}
      </div>
    </aside>
  );
}

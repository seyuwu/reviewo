"use client";

import {
  WAITLIST_INVITE_QUERY,
  WAITLIST_INVITE_VALUE
} from "@reviewo/shared";
import type { MessageKey } from "@reviewo/i18n";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, MouseEvent, useEffect, useMemo, useRef, useState } from "react";

import { FormFeedback } from "../../../components/form-feedback";
import { OpiniaIcon } from "../../../components/opinia-icon";
import { getOrCreateVisitorId } from "../../../lib/site-presence";
import { trackAnalyticsCta } from "../../analytics/components/product-analytics-listener";
import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { copyTextToClipboard } from "../../growth/lib/share-urls";
import { useTranslation } from "../../i18n/locale-provider";
import {
  submitGamesLaunchInterest,
  submitGamesLaunchSuggestion,
  toggleGamesLaunchDevNoteLike,
  type GamesLaunchChannel
} from "../api/games-launch-api";
import { useGamesLaunchStatus } from "../hooks/use-games-launch-status";
import { GamesSearchTipRotator } from "./games-search-tip-rotator";
import styles from "./games-search-view.module.css";
import waitlistStyles from "./games-search-waitlist-view.module.css";

const CHANNELS: GamesLaunchChannel[] = [
  "telegram",
  "discord",
  "newsletter",
  "vk",
  "email",
  "other"
];

const CHANNEL_LABEL: Record<GamesLaunchChannel, MessageKey> = {
  telegram: "games.launch.waitlist.channelTelegram",
  discord: "games.launch.waitlist.channelDiscord",
  newsletter: "games.launch.waitlist.channelNewsletter",
  vk: "games.launch.waitlist.channelVk",
  email: "games.launch.waitlist.channelEmail",
  other: "games.launch.waitlist.channelOther"
};

const CHANNEL_PLACEHOLDER: Record<GamesLaunchChannel, MessageKey> = {
  telegram: "games.launch.waitlist.contactPlaceholderTelegram",
  discord: "games.launch.waitlist.contactPlaceholderDiscord",
  newsletter: "games.launch.waitlist.contactPlaceholderNewsletter",
  vk: "games.launch.waitlist.contactPlaceholderVk",
  email: "games.launch.waitlist.contactPlaceholderEmail",
  other: "games.launch.waitlist.contactPlaceholderOther"
};

const TELEGRAM_CHANNEL_URL = "https://t.me/opinia_official";

interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function getCountdownParts(launchAtMs: number, nowMs: number): CountdownParts {
  const remaining = Math.max(0, launchAtMs - nowMs);
  const totalSeconds = Math.floor(remaining / 1000);

  return {
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3_600),
    minutes: Math.floor((totalSeconds % 3_600) / 60),
    seconds: totalSeconds % 60
  };
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function ChannelLogo({ channel }: { channel: GamesLaunchChannel }) {
  switch (channel) {
    case "telegram":
      return (
        <span className={`${waitlistStyles.channelLogo} ${waitlistStyles.channelLogoTelegram}`}>
          <svg aria-hidden="true" fill="currentColor" viewBox="0 0 24 24">
            <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
          </svg>
        </span>
      );
    case "discord":
      return (
        <span className={`${waitlistStyles.channelLogo} ${waitlistStyles.channelLogoDiscord}`}>
          <svg aria-hidden="true" fill="currentColor" viewBox="0 0 24 24">
            <path d="M20.317 4.37a19.8 19.8 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
          </svg>
        </span>
      );
    case "vk":
      return (
        <span className={`${waitlistStyles.channelLogo} ${waitlistStyles.channelLogoVk}`}>
          <svg aria-hidden="true" fill="currentColor" viewBox="0 0 24 24">
            <path d="M15.07 2H8.93C3.33 2 2 3.33 2 8.93v6.14C2 20.67 3.33 22 8.93 22h6.14c5.6 0 6.93-1.33 6.93-6.93V8.93C22 3.33 20.67 2 15.07 2zm3.08 14.27h-1.46c-.55 0-.72-.44-1.71-1.42-.86-.84-1.24-.96-1.45-.96-.3 0-.38.09-.38.5v1.36c0 .35-.11.57-1.04.57-1.54 0-3.25-.93-4.45-2.67C6.35 11.88 5.85 9.97 5.85 9.58c0-.21.09-.41.5-.41h1.46c.37 0 .51.17.65.57.72 2.08 1.92 3.9 2.42 3.9.18 0 .27-.09.27-.55V10.1c-.06-.99-.58-1.08-.58-1.43 0-.17.14-.34.37-.34h2.29c.31 0 .42.17.42.54v2.9c0 .31.14.42.23.42.18 0 .34-.11.68-.45 1.05-1.17 1.8-2.98 1.8-2.98.1-.21.27-.41.64-.41h1.46c.44 0 .53.23.44.54-.18.85-1.96 3.36-1.96 3.36-.16.25-.21.37 0 .65.15.21.66.65 1 .1.62.71 1.1 1.3 1.23 1.71.14.41-.07.62-.48.62z" />
          </svg>
        </span>
      );
    case "newsletter":
    case "email":
      return (
        <span className={`${waitlistStyles.channelLogo} ${waitlistStyles.channelLogoMail}`}>
          <svg aria-hidden="true" fill="currentColor" viewBox="0 0 24 24">
            <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5L4 8V6l8 5 8-5v2z" />
          </svg>
        </span>
      );
    default:
      return (
        <span className={`${waitlistStyles.channelLogo} ${waitlistStyles.channelLogoOther}`}>
          <svg aria-hidden="true" fill="currentColor" viewBox="0 0 24 24">
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
          </svg>
        </span>
      );
  }
}

function LaunchCountdown({ launchAt }: { launchAt: string }) {
  const t = useTranslation();
  const launchAtMs = useMemo(() => Date.parse(launchAt), [launchAt]);
  // null until mount — avoids SSR/client second mismatch (hydration).
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const parts =
    nowMs === null
      ? null
      : getCountdownParts(Number.isFinite(launchAtMs) ? launchAtMs : Date.now(), nowMs);

  return (
    <aside className={waitlistStyles.countdown}>
      <div className={waitlistStyles.countdownHead}>
        <span className={waitlistStyles.countdownIcon} aria-hidden="true">
          <svg fill="none" viewBox="0 0 24 24">
            <rect height="14" rx="2" stroke="currentColor" strokeWidth="1.7" width="16" x="4" y="6" />
            <path d="M8 4v4M16 4v4M4 11h16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
          </svg>
        </span>
        <strong>{t("games.launch.waitlist.countdownTitle")}</strong>
      </div>
      <p className={waitlistStyles.countdownDate}>{t("games.launch.waitlist.dateLabel")}</p>
      <p className={waitlistStyles.countdownTime}>{t("games.launch.waitlist.timeZone")}</p>
      <div className={waitlistStyles.countdownGrid} aria-live="polite">
        <div className={waitlistStyles.countdownCell}>
          <strong>{parts ? pad2(parts.days) : "--"}</strong>
          <span>{t("games.launch.waitlist.countdownDays")}</span>
        </div>
        <div className={waitlistStyles.countdownCell}>
          <strong>{parts ? pad2(parts.hours) : "--"}</strong>
          <span>{t("games.launch.waitlist.countdownHours")}</span>
        </div>
        <div className={waitlistStyles.countdownCell}>
          <strong>{parts ? pad2(parts.minutes) : "--"}</strong>
          <span>{t("games.launch.waitlist.countdownMinutes")}</span>
        </div>
        <div className={waitlistStyles.countdownCell}>
          <strong>{parts ? pad2(parts.seconds) : "--"}</strong>
          <span>{t("games.launch.waitlist.countdownSeconds")}</span>
        </div>
      </div>
    </aside>
  );
}

export function GamesSearchWaitlistView() {
  const t = useTranslation();
  const router = useRouter();
  const { authSession } = useAuthSession();
  const { status, refresh, setStatus } = useGamesLaunchStatus();
  const date = t("games.launch.waitlist.dateLabel");
  const time = t("games.launch.waitlist.timeLabel");

  const [suggestion, setSuggestion] = useState("");
  const [suggestionBusy, setSuggestionBusy] = useState(false);
  const [suggestionDone, setSuggestionDone] = useState(false);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);

  const [channel, setChannel] = useState<GamesLaunchChannel>("telegram");
  const [contact, setContact] = useState("");
  const [otherService, setOtherService] = useState("");
  const [interestBusy, setInterestBusy] = useState(false);
  const [interestDone, setInterestDone] = useState(false);
  const [interestError, setInterestError] = useState<string | null>(null);
  const [likeBusy, setLikeBusy] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [createProfileBusy, setCreateProfileBusy] = useState(false);
  const otherServiceInputRef = useRef<HTMLInputElement>(null);
  const formStartTrackedRef = useRef(false);

  useEffect(() => {
    if (channel !== "other") {
      return;
    }

    otherServiceInputRef.current?.focus();
  }, [channel]);

  function trackFormStartOnce() {
    if (formStartTrackedRef.current) {
      return;
    }

    formStartTrackedRef.current = true;
    trackAnalyticsCta("games_waitlist_form_start");
  }

  const canSubmitInterest =
    contact.trim().length >= 2 && (channel !== "other" || otherService.trim().length >= 2);

  async function handleSuggestion(event: FormEvent) {
    event.preventDefault();
    if (suggestionBusy || suggestion.trim().length < 3) {
      return;
    }

    setSuggestionBusy(true);
    setSuggestionError(null);

    try {
      await submitGamesLaunchSuggestion(
        { body: suggestion.trim(), source: "search" },
        authSession?.accessToken
      );
      setSuggestion("");
      setSuggestionDone(true);
    } catch {
      setSuggestionError(t("games.launch.waitlist.suggestionError"));
    } finally {
      setSuggestionBusy(false);
    }
  }

  async function handleInterest(event: FormEvent) {
    event.preventDefault();
    if (interestBusy || !canSubmitInterest) {
      return;
    }

    setInterestBusy(true);
    setInterestError(null);

    const contactPayload =
      channel === "other"
        ? `${otherService.trim()}: ${contact.trim()}`
        : contact.trim();

    try {
      await submitGamesLaunchInterest(
        { channel, contact: contactPayload },
        authSession?.accessToken
      );
      setContact("");
      setOtherService("");
      setInterestDone(true);
      void refresh();
    } catch {
      setInterestError(t("games.launch.waitlist.interestError"));
    } finally {
      setInterestBusy(false);
    }
  }

  function selectChannel(next: GamesLaunchChannel) {
    trackFormStartOnce();
    setChannel(next);
    setInterestDone(false);
    setInterestError(null);
    if (next !== "other") {
      setOtherService("");
    }
  }

  async function handleShareFriends() {
    void trackAnalyticsCta("games_waitlist_invite_click");

    const url =
      typeof window !== "undefined" ? buildWaitlistInviteUrl(window.location.href) : "";
    const ok = url ? await copyTextToClipboard(url) : false;

    if (!ok) {
      return;
    }

    setShareCopied(true);
    window.setTimeout(() => setShareCopied(false), 1800);
  }

  async function handleCreateProfileClick(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();

    if (createProfileBusy) {
      return;
    }

    setCreateProfileBusy(true);

    try {
      await trackAnalyticsCta("games_waitlist_create_profile_click");
    } finally {
      router.push("/dota/create");
    }
  }

  async function handleDevNoteLike() {
    if (likeBusy) {
      return;
    }

    setLikeBusy(true);

    try {
      const voterKey = authSession?.accessToken ? null : getOrCreateVisitorId();
      const result = await toggleGamesLaunchDevNoteLike(voterKey, authSession?.accessToken);
      setStatus((current) => ({
        ...current,
        devNoteLikeCount: result.likeCount,
        devNoteLiked: result.liked
      }));
    } catch {
      /* keep previous like state */
    } finally {
      setLikeBusy(false);
    }
  }

  return (
    <section className={`${styles.page} ${waitlistStyles.waitlistPage}`}>
      <header className={`${styles.header} ${waitlistStyles.waitlistHeader}`}>
        <div className={styles.headerCopy}>
          <h1 className={`${styles.title} ${waitlistStyles.pageTitle}`}>
            {t("games.launch.waitlist.pageTitle")}
          </h1>
          <p className={`${styles.lead} ${waitlistStyles.pageLead}`}>
            {t("games.launch.waitlist.pageLead", { date, time })}
          </p>
        </div>
        <GamesSearchTipRotator />
      </header>

      <div className={`${styles.layout} ${waitlistStyles.layout}`}>
        <aside className={`${styles.sidebar} ${waitlistStyles.sidebar}`}>
          <section className={`${styles.panel} ${waitlistStyles.sidePanel}`}>
            <h2 className={styles.panelTitle}>{t("games.launch.waitlist.leftTitle")}</h2>
            <p className={styles.controlHint}>{t("games.launch.waitlist.leftLead")}</p>
            <form className={styles.controlBlock} onSubmit={(event) => void handleSuggestion(event)}>
              <label className={styles.controlHint} htmlFor="launch-suggestion">
                {t("games.launch.waitlist.suggestionLabel")}
              </label>
              <textarea
                className={styles.launchField}
                id="launch-suggestion"
                maxLength={2000}
                onChange={(event) => {
                  setSuggestionDone(false);
                  setSuggestion(event.target.value);
                }}
                placeholder={t("games.launch.waitlist.suggestionPlaceholder")}
                rows={2}
                value={suggestion}
              />
              <button
                className="button-primary"
                disabled={suggestionBusy || suggestion.trim().length < 3}
                type="submit"
              >
                {suggestionBusy
                  ? t("common.loadingEllipsis")
                  : t("games.launch.waitlist.suggestionSubmit")}
              </button>
              {suggestionDone ? (
                <FormFeedback statusMessage={t("games.launch.waitlist.suggestionThanks")} />
              ) : null}
              {suggestionError ? <FormFeedback errorMessage={suggestionError} /> : null}
            </form>
            <a
              className={`button-secondary ${waitlistStyles.leftTelegramCta}`}
              href={TELEGRAM_CHANNEL_URL}
              rel="noreferrer"
              target="_blank"
            >
              {t("games.launch.waitlist.botCta")}
            </a>
            <Link className={styles.profileLink} href="/dota/create">
              {t("games.search.createCta")}
            </Link>
          </section>
        </aside>

        <div className={`${styles.main} ${waitlistStyles.mainColumn}`}>
          <div className={`${styles.empty} ${waitlistStyles.centerCard}`}>
            <h2 className={`${styles.emptyTitle} ${waitlistStyles.centerCardTitle}`}>
              {t("games.launch.waitlist.centerTitle")}
            </h2>
            <p className={`${styles.emptyLead} ${waitlistStyles.centerCardLead}`}>
              {t("games.launch.waitlist.centerLead")}
            </p>
            <p className={`${styles.statusText} ${waitlistStyles.centerCardMeta}`}>
              {date} · {time}
            </p>

            <form
              className={waitlistStyles.interestForm}
              onSubmit={(event) => void handleInterest(event)}
            >
              <div
                aria-hidden={interestDone}
                className={`${waitlistStyles.interestFields}${
                  interestDone ? ` ${waitlistStyles.interestFieldsHidden}` : ""
                }`}
              >
                <div className={waitlistStyles.channelGrid} role="radiogroup">
                  {CHANNELS.map((item) => {
                    const selected = channel === item;
                    const isOtherInput = item === "other" && selected;

                    return (
                      <button
                        aria-checked={selected}
                        className={`${waitlistStyles.channelCard}${
                          selected ? ` ${waitlistStyles.channelCardActive}` : ""
                        }`}
                        disabled={interestDone}
                        key={item}
                        onClick={() => selectChannel(item)}
                        role="radio"
                        tabIndex={interestDone ? -1 : undefined}
                        type="button"
                      >
                        <ChannelLogo channel={item} />
                        {isOtherInput ? (
                          <input
                            aria-label={t("games.launch.waitlist.otherServiceLabel")}
                            className={waitlistStyles.otherServiceInput}
                            maxLength={80}
                            onChange={(event) => {
                              setInterestDone(false);
                              setOtherService(event.target.value);
                            }}
                            onClick={(event) => event.stopPropagation()}
                            placeholder={t("games.launch.waitlist.otherServicePlaceholder")}
                            ref={otherServiceInputRef}
                            tabIndex={interestDone ? -1 : undefined}
                            type="text"
                            value={otherService}
                          />
                        ) : (
                          <strong>{t(CHANNEL_LABEL[item])}</strong>
                        )}
                      </button>
                    );
                  })}
                </div>

                <input
                  className={`${styles.launchField} ${waitlistStyles.contactField}`}
                  maxLength={320}
                  onChange={(event) => {
                    setInterestDone(false);
                    setContact(event.target.value);
                  }}
                  onFocus={() => trackFormStartOnce()}
                  placeholder={t(CHANNEL_PLACEHOLDER[channel])}
                  tabIndex={interestDone ? -1 : undefined}
                  type={channel === "email" || channel === "newsletter" ? "email" : "text"}
                  value={contact}
                />
                <button
                  className={`button-primary ${styles.emptyCta}`}
                  disabled={interestBusy || interestDone || !canSubmitInterest}
                  tabIndex={interestDone ? -1 : undefined}
                  type="submit"
                >
                  {interestBusy
                    ? t("common.loadingEllipsis")
                    : t("games.launch.waitlist.interestSubmit")}
                </button>
              </div>

              <div
                aria-hidden={!interestDone}
                className={`${waitlistStyles.interestSuccess}${
                  interestDone ? ` ${waitlistStyles.interestSuccessVisible}` : ""
                }`}
              >
                <p className={waitlistStyles.interestThanksTitle}>
                  {t("games.launch.waitlist.interestThanks")}
                </p>
                <p className={waitlistStyles.interestSharePrompt}>
                  {t("games.launch.waitlist.interestSharePrompt")}
                  <button
                    className={waitlistStyles.shareLink}
                    onClick={() => void handleShareFriends()}
                    tabIndex={interestDone ? undefined : -1}
                    type="button"
                  >
                    {shareCopied
                      ? t("games.launch.waitlist.devNoteShareCopied")
                      : t("games.launch.waitlist.interestShareCta")}
                  </button>
                  <span aria-hidden="true">
                    {" "}
                    {t("games.launch.waitlist.interestShareEmoji")}
                  </span>
                </p>
                <Link
                  className={`button-primary ${waitlistStyles.createProfileButton}`}
                  href="/dota/create"
                  onClick={(event) => void handleCreateProfileClick(event)}
                  tabIndex={interestDone ? undefined : -1}
                >
                  {t("games.launch.waitlist.interestCreateProfile")}
                </Link>
                <button
                  className={waitlistStyles.fillAgainButton}
                  onClick={() => {
                    setInterestDone(false);
                    setInterestError(null);
                    setShareCopied(false);
                  }}
                  tabIndex={interestDone ? undefined : -1}
                  type="button"
                >
                  {t("games.launch.waitlist.interestFillAgain")}
                </button>
              </div>

              {interestError ? <FormFeedback errorMessage={interestError} /> : null}
            </form>
          </div>

          <section className={waitlistStyles.devNote}>
            <div className={waitlistStyles.devNoteHead}>
              <h2 className={waitlistStyles.devNoteTitle}>{t("games.launch.waitlist.devNoteTitle")}</h2>
              <button
                aria-label={
                  status.devNoteLiked
                    ? t("games.launch.waitlist.devNoteLiked")
                    : t("games.launch.waitlist.devNoteLike")
                }
                aria-pressed={status.devNoteLiked}
                className={`${waitlistStyles.likeButton}${
                  status.devNoteLiked ? ` ${waitlistStyles.likeButtonActive}` : ""
                }`}
                disabled={likeBusy}
                onClick={() => void handleDevNoteLike()}
                type="button"
              >
                <OpiniaIcon name="thumb" />
                <span>{status.devNoteLikeCount}</span>
              </button>
            </div>
            <p>{t("games.launch.waitlist.devNoteP1")}</p>
            <p>{t("games.launch.waitlist.devNoteP2")}</p>
            <p>
              {t("games.launch.waitlist.devNoteP3Before")}
              <button
                className={waitlistStyles.shareLink}
                onClick={() => void handleShareFriends()}
                type="button"
              >
                {shareCopied
                  ? t("games.launch.waitlist.devNoteShareCopied")
                  : t("games.launch.waitlist.devNoteShare")}
              </button>
            </p>
          </section>
        </div>

        <aside className={`${styles.sidebar} ${waitlistStyles.sidebar}`}>
          <LaunchCountdown launchAt={status.launchAt} />
          <section className={`${styles.panel} ${waitlistStyles.sidePanel} ${waitlistStyles.waitingPanel}`}>
            <h2 className={styles.panelTitle}>{t("games.launch.waitlist.waitingTitle")}</h2>
            <p className={waitlistStyles.waitingCount}>{status.waitingCount ?? 0}</p>
            <div className={waitlistStyles.waitingStat}>
              <span>{t("games.launch.waitlist.waitingAvgMmr")}</span>
              <strong>
                {status.averageMmr?.trim()
                  ? status.averageMmr
                  : t("games.launch.waitlist.waitingAvgMmrEmpty")}
              </strong>
            </div>
          </section>
          <section className={`${styles.panel} ${waitlistStyles.sidePanel}`}>
            <h2 className={styles.panelTitle}>{t("games.launch.waitlist.rightHowTitle")}</h2>
            <ol className={`${styles.howList} ${waitlistStyles.howList}`}>
              <li>{t("games.launch.waitlist.rightHow1")}</li>
              <li>{t("games.launch.waitlist.rightHow2")}</li>
              <li>{t("games.launch.waitlist.rightHow3")}</li>
              <li>{t("games.launch.waitlist.rightHow4")}</li>
            </ol>
          </section>
        </aside>
      </div>
    </section>
  );
}

function buildWaitlistInviteUrl(href: string): string {
  try {
    const url = new URL(href);
    url.searchParams.set(WAITLIST_INVITE_QUERY || "from", WAITLIST_INVITE_VALUE || "waitlist_invite");
    return url.toString();
  } catch {
    return href;
  }
}

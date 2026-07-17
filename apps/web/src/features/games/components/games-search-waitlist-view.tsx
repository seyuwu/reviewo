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
import { useMyDotaProfileNav } from "../../dota/hooks/use-my-dota-profile-nav";
import { copyTextToClipboard } from "../../growth/lib/share-urls";
import { useLocale, useTranslation } from "../../i18n/locale-provider";
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

const ALT_CHANNELS: GamesLaunchChannel[] = ["telegram", "discord", "email", "other"];

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
const TELEGRAM_CHANNEL_HANDLE = "@opinia_official";
const TELEGRAM_JOIN_RECORDED_KEY = "opinia.games.waitlist.telegramJoin.v1";
/** "1" = show after-join; "0" = user chose fill-again (do not remigrate from TG key). */
const WAITLIST_COMMITTED_KEY = "opinia.games.waitlist.committed.v1";

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

function russianPluralUnit(
  count: number,
  one: string,
  few: string,
  many: string
): string {
  const n = Math.abs(count) % 100;
  const n1 = n % 10;

  if (n > 10 && n < 20) {
    return many;
  }

  if (n1 === 1) {
    return one;
  }

  if (n1 >= 2 && n1 <= 4) {
    return few;
  }

  return many;
}

function englishPluralUnit(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

function formatOpensWhen(
  t: (key: MessageKey, params?: Record<string, string | number>) => string,
  locale: "en" | "ru",
  launchAt: string,
  nowMs: number
): string {
  const launchAtMs = Date.parse(launchAt);
  const parts = getCountdownParts(Number.isFinite(launchAtMs) ? launchAtMs : nowMs, nowMs);

  if (parts.days >= 1) {
    const unit =
      locale === "ru"
        ? russianPluralUnit(
            parts.days,
            t("games.launch.waitlist.unitDayOne"),
            t("games.launch.waitlist.unitDayFew"),
            t("games.launch.waitlist.unitDayMany")
          )
        : englishPluralUnit(
            parts.days,
            t("games.launch.waitlist.unitDayOne"),
            t("games.launch.waitlist.unitDayMany")
          );

    return t("games.launch.waitlist.opensInDays", { count: parts.days, unit });
  }

  if (parts.hours >= 1) {
    const unit =
      locale === "ru"
        ? russianPluralUnit(
            parts.hours,
            t("games.launch.waitlist.unitHourOne"),
            t("games.launch.waitlist.unitHourFew"),
            t("games.launch.waitlist.unitHourMany")
          )
        : englishPluralUnit(
            parts.hours,
            t("games.launch.waitlist.unitHourOne"),
            t("games.launch.waitlist.unitHourMany")
          );

    return t("games.launch.waitlist.opensInHours", { count: parts.hours, unit });
  }

  if (parts.minutes >= 1) {
    const unit =
      locale === "ru"
        ? russianPluralUnit(
            parts.minutes,
            t("games.launch.waitlist.unitMinuteOne"),
            t("games.launch.waitlist.unitMinuteFew"),
            t("games.launch.waitlist.unitMinuteMany")
          )
        : englishPluralUnit(
            parts.minutes,
            t("games.launch.waitlist.unitMinuteOne"),
            t("games.launch.waitlist.unitMinuteMany")
          );

    return t("games.launch.waitlist.opensInMinutes", { count: parts.minutes, unit });
  }

  return t("games.launch.waitlist.opensSoon");
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
            <circle cx="6" cy="12" r="1.8" />
            <circle cx="12" cy="12" r="1.8" />
            <circle cx="18" cy="12" r="1.8" />
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

function readWaitlistCommitted(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const committed = window.localStorage.getItem(WAITLIST_COMMITTED_KEY);

    if (committed === "1") {
      return true;
    }

    if (committed === "0") {
      return false;
    }

    // Migrate pre-persistence TG joins into committed UI state once.
    if (window.localStorage.getItem(TELEGRAM_JOIN_RECORDED_KEY) === "1") {
      window.localStorage.setItem(WAITLIST_COMMITTED_KEY, "1");
      return true;
    }
  } catch {
    /* ignore storage errors */
  }

  return false;
}

function writeWaitlistCommitted(committed: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(WAITLIST_COMMITTED_KEY, committed ? "1" : "0");
  } catch {
    /* ignore storage errors */
  }
}

export function GamesSearchWaitlistView() {
  const t = useTranslation();
  const { resolvedLocale } = useLocale();
  const router = useRouter();
  const { authSession } = useAuthSession();
  const myDotaProfile = useMyDotaProfileNav();
  const { status, refresh, setStatus } = useGamesLaunchStatus();
  const date = t("games.launch.waitlist.dateLabel");
  const time = t("games.launch.waitlist.timeLabel");
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const opensWhen = useMemo(() => {
    if (nowMs === null) {
      return t("games.launch.waitlist.opensSoon");
    }

    return formatOpensWhen(t, resolvedLocale, status.launchAt, nowMs);
  }, [nowMs, resolvedLocale, status.launchAt, t]);

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
  const [showAltContact, setShowAltContact] = useState(false);
  const [telegramJoined, setTelegramJoined] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [channelHandleCopied, setChannelHandleCopied] = useState(false);
  const [createProfileBusy, setCreateProfileBusy] = useState(false);
  const otherServiceInputRef = useRef<HTMLInputElement>(null);
  const formStartTrackedRef = useRef(false);
  const profileHref = myDotaProfile.href;
  const profileCtaLabel = myDotaProfile.hasProfile
    ? t("games.launch.waitlist.interestOpenProfile")
    : t("games.launch.waitlist.interestCreateProfile");
  const leftProfileCtaLabel = myDotaProfile.hasProfile
    ? t("games.search.openProfileCta")
    : t("games.search.createCta");

  useEffect(() => {
    if (readWaitlistCommitted()) {
      setTelegramJoined(true);
    }
  }, []);

  useEffect(() => {
    if (channel !== "other") {
      return;
    }

    otherServiceInputRef.current?.focus();
  }, [channel]);

  function markWaitlistCommitted() {
    writeWaitlistCommitted(true);
    setTelegramJoined(true);
    setShowAltContact(false);
  }

  function resetWaitlistCommittedUi() {
    writeWaitlistCommitted(false);
    setTelegramJoined(false);
    setShowAltContact(false);
    setInterestDone(false);
    setInterestError(null);
    setShareCopied(false);
    setChannelHandleCopied(false);
  }

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
      markWaitlistCommitted();
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

  function openAltContact(next: GamesLaunchChannel) {
    selectChannel(next);
    setShowAltContact(true);
  }

  async function handleCopyTelegramHandle() {
    const ok = await copyTextToClipboard(TELEGRAM_CHANNEL_HANDLE);

    if (!ok) {
      return;
    }

    setChannelHandleCopied(true);
    window.setTimeout(() => setChannelHandleCopied(false), 1800);
  }

  async function handleTelegramJoin() {
    void trackAnalyticsCta("games_waitlist_telegram_join");
    setInterestError(null);
    markWaitlistCommitted();
    window.open(TELEGRAM_CHANNEL_URL, "_blank", "noopener,noreferrer");

    try {
      const alreadyRecorded =
        typeof window !== "undefined" &&
        window.localStorage.getItem(TELEGRAM_JOIN_RECORDED_KEY) === "1";

      if (alreadyRecorded) {
        return;
      }

      await submitGamesLaunchInterest(
        { channel: "telegram", contact: "@opinia_official" },
        authSession?.accessToken
      );
      window.localStorage.setItem(TELEGRAM_JOIN_RECORDED_KEY, "1");
      void refresh();
    } catch {
      /* channel still opens; counter update is best-effort */
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
      if (!myDotaProfile.hasProfile) {
        await trackAnalyticsCta("games_waitlist_create_profile_click");
      }
    } finally {
      router.push(profileHref);
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
            {t("games.launch.waitlist.pageLead", { date, time, when: opensWhen })}
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
            <Link className={styles.profileLink} href={profileHref}>
              {leftProfileCtaLabel}
            </Link>
          </section>
        </aside>

        <div className={`${styles.main} ${waitlistStyles.mainColumn}`}>
          <div className={`${styles.empty} ${waitlistStyles.centerCard}`}>
            <div aria-hidden="true" className={waitlistStyles.centerArt} />
            <div aria-hidden="true" className={waitlistStyles.centerArtFade} />

            <div className={waitlistStyles.centerInner}>
              <div className={waitlistStyles.centerIntro}>
                <h2 className={waitlistStyles.centerHero}>
                  {t("games.launch.waitlist.centerHeroBefore")}
                  <span className={waitlistStyles.centerHeroAccent}>
                    {t("games.launch.waitlist.centerHeroAccent")}
                  </span>
                  {t("games.launch.waitlist.centerHeroAfter", { when: opensWhen })}
                </h2>
                <p className={waitlistStyles.centerHeroLead}>
                  {t("games.launch.waitlist.centerHeroLead")}
                </p>
              </div>

              <ul className={waitlistStyles.centerPills}>
                <li>
                  <span aria-hidden="true" className={waitlistStyles.centerPillIcon}>
                    <svg fill="none" viewBox="0 0 24 24">
                      <path
                        d="M5 7h14a1 1 0 0 1 1 1v8.2a1 1 0 0 1-1 1H9.4L5 20.2V8a1 1 0 0 1 1-1z"
                        stroke="currentColor"
                        strokeLinejoin="round"
                        strokeWidth="1.7"
                      />
                      <path
                        d="M8.5 11.2c1.2.9 2.6 1.4 4 1.4s2.8-.5 4-1.4"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeWidth="1.7"
                      />
                    </svg>
                  </span>
                  <span>{t("games.launch.waitlist.centerPillIdeas")}</span>
                </li>
                <li>
                  <span aria-hidden="true" className={waitlistStyles.centerPillIcon}>
                    <svg fill="none" viewBox="0 0 24 24">
                      <path
                        d="M5 9.5h14v10H5v-10zM12 9.5v10M5 13.5h14M9 9.5V8a3 3 0 0 1 6 0v1.5"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.7"
                      />
                    </svg>
                  </span>
                  <span>{t("games.launch.waitlist.centerPillAccess")}</span>
                </li>
                <li>
                  <span aria-hidden="true" className={waitlistStyles.centerPillIcon}>
                    <svg fill="none" viewBox="0 0 24 24">
                      <path
                        d="M12 3.8c1.9 1.4 3.4 3.4 4 5.6.4 1.5.2 3-.5 4.3L12 20l-3.5-6.3c-.7-1.3-.9-2.8-.5-4.3.6-2.2 2.1-4.2 4-5.6z"
                        stroke="currentColor"
                        strokeLinejoin="round"
                        strokeWidth="1.7"
                      />
                      <path
                        d="m9.3 14.7-2 4M14.7 14.7l2 4"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeWidth="1.7"
                      />
                    </svg>
                  </span>
                  <span>{t("games.launch.waitlist.centerPillNews")}</span>
                </li>
                <li>
                  <span aria-hidden="true" className={waitlistStyles.centerPillIcon}>
                    <svg fill="none" viewBox="0 0 24 24">
                      <circle cx="12" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.7" />
                      <circle cx="7.2" cy="9.2" r="1.8" stroke="currentColor" strokeWidth="1.7" />
                      <circle cx="16.8" cy="9.2" r="1.8" stroke="currentColor" strokeWidth="1.7" />
                      <path
                        d="M5 18c.6-2 2-3.1 3.8-3.1.7 0 1.3.2 1.9.5M19 18c-.6-2-2-3.1-3.8-3.1-.7 0-1.3.2-1.9.5M8.8 18c.7-1.7 2-2.6 3.2-2.6s2.5.9 3.2 2.6"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeWidth="1.7"
                      />
                    </svg>
                  </span>
                  <span>{t("games.launch.waitlist.centerPillBuild")}</span>
                </li>
              </ul>

              <div className={waitlistStyles.tgCard}>
                <div className={waitlistStyles.tgCardCopy}>
                  <span aria-hidden="true" className={waitlistStyles.tgCardLogo}>
                    <svg fill="currentColor" viewBox="0 0 24 24">
                      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                    </svg>
                  </span>
                  <div className={waitlistStyles.tgCardText}>
                    <strong>{t("games.launch.waitlist.centerTgTitle")}</strong>
                    <p>{t("games.launch.waitlist.centerTgLead")}</p>
                    <button
                      className={waitlistStyles.tgHandleCopy}
                      onClick={() => void handleCopyTelegramHandle()}
                      type="button"
                    >
                      {channelHandleCopied
                        ? t("games.launch.waitlist.altContactChannelCopied")
                        : TELEGRAM_CHANNEL_HANDLE}
                    </button>
                  </div>
                </div>
                <button
                  className={waitlistStyles.tgCardCta}
                  onClick={() => void handleTelegramJoin()}
                  type="button"
                >
                  {t("games.launch.waitlist.channelJoinCta")}
                  <svg aria-hidden="true" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
                  </svg>
                </button>
              </div>

              <div className={waitlistStyles.afterTgStage}>
                <div
                  aria-hidden={telegramJoined}
                  className={`${waitlistStyles.afterTgPanel}${
                    telegramJoined ? ` ${waitlistStyles.afterTgPanelHidden}` : ""
                  }`}
                >
                  <div className={waitlistStyles.altContactBlock}>
                    <p className={waitlistStyles.altContactPrompt}>
                      {t("games.launch.waitlist.altContactPrompt")}
                    </p>
                    <div className={waitlistStyles.altContactRow}>
                      {ALT_CHANNELS.map((item) => (
                        <button
                          className={`${waitlistStyles.altContactChip}${
                            showAltContact && channel === item
                              ? ` ${waitlistStyles.altContactChipActive}`
                              : ""
                          }`}
                          key={item}
                          onClick={() => openAltContact(item)}
                          tabIndex={telegramJoined ? -1 : undefined}
                          type="button"
                        >
                          <ChannelLogo channel={item} />
                          <span>
                            {item === "email"
                              ? t("games.launch.waitlist.altContactEmail")
                              : item === "telegram"
                                ? t("games.launch.waitlist.altContactTelegram")
                                : t(CHANNEL_LABEL[item])}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {showAltContact && !telegramJoined ? (
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
                        {channel === "other" ? (
                          <input
                            aria-label={t("games.launch.waitlist.otherServiceLabel")}
                            className={`${styles.launchField} ${waitlistStyles.contactField}`}
                            maxLength={80}
                            onChange={(event) => {
                              setInterestDone(false);
                              setOtherService(event.target.value);
                            }}
                            placeholder={t("games.launch.waitlist.otherServicePlaceholder")}
                            ref={otherServiceInputRef}
                            type="text"
                            value={otherService}
                          />
                        ) : null}
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
                          type={
                            channel === "email" || channel === "newsletter" ? "email" : "text"
                          }
                          value={contact}
                        />
                        <div className={waitlistStyles.altFormActions}>
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
                          <button
                            className={waitlistStyles.altContactToggle}
                            onClick={() => {
                              setShowAltContact(false);
                              setInterestError(null);
                            }}
                            type="button"
                          >
                            {t("games.launch.waitlist.altContactHide")}
                          </button>
                        </div>
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
                        <Link
                          className={`button-primary ${waitlistStyles.createProfileButton}`}
                          href={profileHref}
                          onClick={(event) => void handleCreateProfileClick(event)}
                          tabIndex={interestDone ? undefined : -1}
                        >
                          {profileCtaLabel}
                        </Link>
                        <button
                          className={waitlistStyles.fillAgainButton}
                          onClick={() => {
                            resetWaitlistCommittedUi();
                          }}
                          tabIndex={interestDone ? undefined : -1}
                          type="button"
                        >
                          {t("games.launch.waitlist.interestFillAgain")}
                        </button>
                      </div>

                      {interestError ? <FormFeedback errorMessage={interestError} /> : null}
                    </form>
                  ) : null}
                </div>

                <div
                  aria-hidden={!telegramJoined}
                  className={`${waitlistStyles.afterTgPanel} ${waitlistStyles.afterJoinWrap}${
                    telegramJoined ? ` ${waitlistStyles.afterTgPanelVisible}` : ""
                  }`}
                >
                  <div className={waitlistStyles.afterJoinCard}>
                    <div className={waitlistStyles.afterJoinCopy}>
                      <strong>{t("games.launch.waitlist.afterJoinTitle")}</strong>
                      <p>{t("games.launch.waitlist.afterJoinLead")}</p>
                    </div>
                    <div className={waitlistStyles.afterJoinActions}>
                      <Link
                        className={waitlistStyles.tgCardCta}
                        href={profileHref}
                        onClick={(event) => void handleCreateProfileClick(event)}
                        tabIndex={telegramJoined ? undefined : -1}
                      >
                        {profileCtaLabel}
                      </Link>
                      <button
                        className={waitlistStyles.afterJoinShare}
                        onClick={() => void handleShareFriends()}
                        tabIndex={telegramJoined ? undefined : -1}
                        type="button"
                      >
                        {shareCopied
                          ? t("games.launch.waitlist.devNoteShareCopied")
                          : t("games.launch.waitlist.afterJoinShare")}
                      </button>
                    </div>
                  </div>
                  <button
                    className={waitlistStyles.afterJoinFillAgain}
                    onClick={() => {
                      resetWaitlistCommittedUi();
                    }}
                    tabIndex={telegramJoined ? undefined : -1}
                    type="button"
                  >
                    {t("games.launch.waitlist.afterJoinFillAgain")}
                  </button>
                </div>
              </div>
            </div>
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

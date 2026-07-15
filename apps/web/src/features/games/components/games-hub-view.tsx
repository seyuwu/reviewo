"use client";

import Link from "next/link";
import { useState } from "react";

import { OpiniaIcon } from "../../../components/opinia-icon";
import { useMyDotaProfileNav } from "../../dota/hooks/use-my-dota-profile-nav";
import { listLiveGameVerticals, listSoonGameVerticals } from "../lib/game-profile-catalog";
import { useTranslation } from "../../i18n/locale-provider";
import styles from "./games-hub-view.module.css";

const CONTACT_EMAIL = "opiniasupport@gmail.com";

export function GamesHubView() {
  const t = useTranslation();
  const myDotaProfile = useMyDotaProfileNav();
  const [inviteCopied, setInviteCopied] = useState(false);
  const liveGames = listLiveGameVerticals();
  const soonGames = listSoonGameVerticals();

  async function handleInvite() {
    const url = `${window.location.origin}/games`;

    try {
      await navigator.clipboard.writeText(url);
      setInviteCopied(true);
      window.setTimeout(() => setInviteCopied(false), 1800);
    } catch {
      // Clipboard can be blocked by browser permissions.
    }
  }

  return (
    <section className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>{t("games.hub.eyebrow")}</p>
          <h1 className={styles.title}>{t("games.hub.title")}</h1>
          <p className={styles.lead}>{t("games.hub.lead")}</p>
          <Link
            aria-busy={myDotaProfile.isLoading}
            className="button-primary"
            data-analytics="games_hero_profile"
            href={myDotaProfile.href}
          >
            {myDotaProfile.isLoading
              ? t("common.loadingEllipsis")
              : myDotaProfile.hasProfile
                ? t("games.hub.openProfile")
                : t("games.hub.createProfile")}
          </Link>
        </div>
        <div className={styles.heroArtwork} aria-hidden="true">
          <span className={styles.heroMark}>
            <OpiniaIcon name="trophy" />
          </span>
        </div>
      </header>

      <section className={styles.communityCallout}>
        <span className={styles.communityIcon} aria-hidden="true">
          <OpiniaIcon name="gamepad" />
        </span>
        <div className={styles.communityCopy}>
          <p className={styles.eyebrow}>{t("games.hub.communityEyebrow")}</p>
          <h2>{t("games.hub.communityTitle")}</h2>
          <p>{t("games.hub.communityLead")}</p>
          <Link className="button-secondary" href="/games/search">
            {t("games.hub.openSearch")}
          </Link>
        </div>
        <div className={styles.communityActions}>
          <Link className="button-primary" data-analytics="games_hero_profile" href={myDotaProfile.href}>
            {myDotaProfile.hasProfile ? t("games.hub.openProfile") : t("games.hub.createProfile")}
          </Link>
          <button
            className="button-secondary"
            data-analytics="games_invite_friends"
            onClick={handleInvite}
            type="button"
          >
            {inviteCopied ? t("games.hub.inviteCopied") : t("games.hub.inviteCta")}
          </button>
        </div>
      </section>

      <div className={styles.grid}>
        {liveGames.map((game) => (
          <Link
            className={styles.card}
            data-analytics="games_open_dota"
            href={game.hubPath ?? "/games"}
            key={game.id}
          >
            <span className={`${styles.logo} ${game.id === "dota" ? styles.dotaLogo : ""}`}>
              {game.logoGlyph}
            </span>
            <h2 className={styles.cardTitle}>
              {game.id === "dota" ? t("games.hub.dota.title") : game.title}
            </h2>
            <p className={styles.cardLead}>
              {game.id === "dota" ? t("games.hub.dota.lead") : t("games.hub.moreSoon")}
            </p>
            <span className={styles.cardMeta}>
              {game.id === "dota" ? t("games.hub.dota.cta") : t("web.profile.dashboard.comingSoon")}
            </span>
          </Link>
        ))}
        {/* Future: add-another-game CTA appears when GAME_PROFILE_MANAGEMENT_UI.canAddAdditionalGames. */}
        {soonGames.map((game) => (
          <article className={`${styles.card} ${styles.cardDisabled}`} key={game.id}>
            <span className={styles.logo}>{game.logoGlyph}</span>
            <h2 className={styles.cardTitle}>{game.title}</h2>
            <p className={styles.cardLead}>{t("games.hub.moreSoon")}</p>
            <span className={styles.cardMeta}>{t("web.profile.dashboard.comingSoon")}</span>
          </article>
        ))}
      </div>

      <section className={styles.suggestionsCallout}>
        <span className={styles.communityIcon} aria-hidden="true">
          <OpiniaIcon name="message" />
        </span>
        <div className={styles.communityCopy}>
          <p className={styles.eyebrow}>{t("games.hub.suggestionsEyebrow")}</p>
          <h2>{t("games.hub.suggestionsTitle")}</h2>
          <p>{t("games.hub.suggestionsLead")}</p>
        </div>
        <div className={styles.suggestionsActions}>
          <a
            className="button-primary"
            data-analytics="games_suggestions_mail"
            href={`mailto:${CONTACT_EMAIL}`}
          >
            {t("games.hub.suggestionsCta")}
          </a>
          <a className={styles.suggestionsEmail} href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
        </div>
      </section>

      <section className={styles.partnershipCallout}>
        <span className={styles.communityIcon} aria-hidden="true">
          <OpiniaIcon name="sparkle" />
        </span>
        <div className={styles.communityCopy}>
          <p className={styles.eyebrow}>{t("games.hub.partnershipEyebrow")}</p>
          <h2>{t("games.hub.partnershipTitle")}</h2>
          <p>{t("games.hub.partnershipLead")}</p>
        </div>
        <div className={styles.suggestionsActions}>
          <a className="button-primary" href={`mailto:${CONTACT_EMAIL}`}>
            {t("games.hub.partnershipCta")}
          </a>
          <a className={styles.suggestionsEmail} href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
        </div>
      </section>
    </section>
  );
}

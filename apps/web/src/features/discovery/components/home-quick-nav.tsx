"use client";

import Link from "next/link";

import { OpiniaIcon } from "../../../components/opinia-icon";
import { publicEnv } from "../../../lib/config/public-env";
import { useTranslation } from "../../i18n/locale-provider";

type QuickNavIcon = "battle" | "extension" | "gamepad" | "help" | "spotlight" | "trophy";

interface QuickNavItem {
  description: string;
  external: boolean;
  href: string;
  icon: QuickNavIcon;
  iconClass: string;
  label: string;
}

export function HomeQuickNav() {
  const t = useTranslation();
  const extensionUrl = publicEnv.extensionInstallUrl;

  const links: QuickNavItem[] = [
    { description: t("web.homeFeed.quickGames"), external: false, href: "/games", icon: "gamepad", iconClass: "home-quick-nav-icon--games", label: t("web.nav.gamesHub") },
    { description: t("web.homeFeed.quickBattles"), external: false, href: "/battles", icon: "battle", iconClass: "home-quick-nav-icon--battles", label: t("web.nav.battles") },
    { description: t("web.homeFeed.quickTops"), external: false, href: "/top", icon: "trophy", iconClass: "home-quick-nav-icon--tops", label: t("web.nav.tops") },
    { description: t("web.homeFeed.quickSpotlight"), external: false, href: "/spotlight", icon: "spotlight", iconClass: "home-quick-nav-icon--spotlight", label: t("web.nav.spotlight") },
    { description: t("web.homeFeed.quickContribute"), external: false, href: "/contribute", icon: "help", iconClass: "home-quick-nav-icon--contribute", label: t("web.nav.contribute") },
    {
      description: t("web.homeFeed.quickExtension"),
      external: Boolean(extensionUrl),
      href: extensionUrl ?? "/search",
      icon: "extension",
      iconClass: "home-quick-nav-icon--extension",
      label: t("web.extensionCta.headerLabel")
    }
  ];

  return (
    <nav className="home-quick-nav" aria-label={t("web.homeFeed.quickNavAriaLabel")}>
      {links.map((link) =>
        link.external ? (
          <a
            key={link.href}
            className="home-quick-nav-card"
            href={link.href}
            rel="noopener noreferrer"
            target="_blank"
          >
            <span className={`home-quick-nav-icon ${link.iconClass}`} aria-hidden="true">
              <OpiniaIcon name={link.icon} />
            </span>
            <span className="home-quick-nav-copy">
              <strong className="home-quick-nav-label">{link.label}</strong>
              <span>{link.description}</span>
            </span>
          </a>
        ) : (
          <Link key={link.href} className="home-quick-nav-card" href={link.href}>
            <span className={`home-quick-nav-icon ${link.iconClass}`} aria-hidden="true">
              <OpiniaIcon name={link.icon} />
            </span>
            <span className="home-quick-nav-copy">
              <strong className="home-quick-nav-label">{link.label}</strong>
              <span>{link.description}</span>
            </span>
          </Link>
        )
      )}
    </nav>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ExtensionHeaderLink } from "../features/extension/components/extension-header-link";
import { useTranslation } from "../features/i18n/locale-provider";
import { OpiniaIcon } from "./opinia-icon";

export function HeaderActivityNav() {
  const t = useTranslation();
  const pathname = usePathname();

  const links = [
    { href: "/search", icon: "search" as const, label: t("web.nav.search"), tone: "objects" as const },
    { href: "/games", icon: "gamepad" as const, label: t("web.nav.gamesHub"), tone: "games" as const },
    { href: "/battles", icon: "battle" as const, label: t("web.nav.battles"), tone: "battles" as const },
    { href: "/top", icon: "trophy" as const, label: t("web.nav.tops"), tone: "tops" as const },
    { href: "/spotlight", icon: "spotlight" as const, label: t("web.nav.spotlight"), tone: "spotlight" as const },
    { href: "/contribute", icon: "help" as const, label: t("web.nav.contribute"), tone: "contribute" as const }
  ];

  return (
    <nav className="app-chrome-nav" aria-label={t("web.nav.ariaLabel")}>
      {links.map((link) => (
        <Link
          key={link.href}
          className={navLinkClass(pathname, link.href, link.tone)}
          data-analytics={link.href === "/games" ? "header_games" : undefined}
          href={link.href}
        >
          <span className={`app-chrome-nav-icon app-chrome-nav-icon--${link.tone}`}>
            <OpiniaIcon className="app-chrome-nav-icon-svg" name={link.icon} />
          </span>
          <span>{link.label}</span>
        </Link>
      ))}
      <ExtensionHeaderLink />
    </nav>
  );
}

function navLinkClass(pathname: string, href: string, tone: NavTone): string {
  const isActive = pathname === href || pathname.startsWith(`${href}/`);

  return isActive
    ? `app-chrome-nav-link app-chrome-nav-link--${tone} is-active`
    : `app-chrome-nav-link app-chrome-nav-link--${tone}`;
}

type NavTone = "objects" | "games" | "battles" | "tops" | "spotlight" | "contribute";

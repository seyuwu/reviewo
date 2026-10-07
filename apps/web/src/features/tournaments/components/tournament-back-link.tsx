import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./tournament-back-link.module.css";

export function TournamentBackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link className={styles.link} href={href}>
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M19 12H5m7-7-7 7 7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>{children}</span>
    </Link>
  );
}

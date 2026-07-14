import Link from "next/link";
import { ReactNode } from "react";

import { useTranslation } from "../../i18n/locale-provider";

interface FeedSectionProps {
  children: ReactNode;
  embedded?: boolean;
  heading: string;
  headingId: string;
  viewAllHref?: string;
}

export function FeedSection({ children, embedded = false, heading, headingId, viewAllHref }: FeedSectionProps) {
  const t = useTranslation();

  return (
    <section
      className={embedded ? "discovery-feed-section discovery-feed-section--flat" : "discovery-feed-section"}
      aria-labelledby={headingId}
    >
      <div className="discovery-feed-section-header">
        <h2 id={headingId}>{heading}</h2>
        {viewAllHref ? (
          <Link className="discovery-feed-view-all" href={viewAllHref}>
            {t("web.homeFeed.viewAll")}
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

"use client";

import { useEffect, useState, type ReactNode } from "react";

import {
  buildDotaBotStartUrl,
  captureDotaBotAttributionFromCurrentUrl,
  getDotaBotAttributionForVisit,
  getDotaBotClickCtaKey,
  type DotaBotAcquisitionSource
} from "../../../lib/config/dota-bot";
import { trackAnalyticsCta } from "../../analytics/components/product-analytics-listener";

type TrackedDotaBotLinkProps = {
  children: ReactNode;
  className: string;
  source: DotaBotAcquisitionSource;
};

export function TrackedDotaBotLink({ children, className, source }: TrackedDotaBotLinkProps) {
  const [link, setLink] = useState(() => ({
    href: buildDotaBotStartUrl(source),
    source
  }));

  useEffect(() => {
    captureDotaBotAttributionFromCurrentUrl();
    const attribution = getDotaBotAttributionForVisit(source);
    setLink({
      href: buildDotaBotStartUrl(attribution.source, attribution.campaign),
      source: attribution.source
    });
  }, [source]);

  return (
    <a
      className={className}
      href={link.href}
      onClick={() => void trackAnalyticsCta(getDotaBotClickCtaKey(link.source))}
      rel="noreferrer"
      target="_blank"
    >
      {children}
    </a>
  );
}

"use client";

import type { ReactNode } from "react";

import {
  buildDotaBotStartUrl,
  type DotaBotAcquisitionSource
} from "../../../lib/config/dota-bot";
import { trackAnalyticsCta } from "../../analytics/components/product-analytics-listener";

type TrackedDotaBotLinkProps = {
  children: ReactNode;
  className: string;
  source: DotaBotAcquisitionSource;
};

export function TrackedDotaBotLink({
  children,
  className,
  source
}: TrackedDotaBotLinkProps) {
  return (
    <a
      className={className}
      href={buildDotaBotStartUrl(source)}
      onClick={() => void trackAnalyticsCta("dota_bot_cta_seo")}
      rel="noreferrer"
      target="_blank"
    >
      {children}
    </a>
  );
}

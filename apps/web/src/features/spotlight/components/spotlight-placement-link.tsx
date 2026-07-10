"use client";

import Link from "next/link";
import { useEffect, useRef, type MouseEvent, type ReactNode } from "react";

import { getOrCreateVisitorId } from "../../../lib/site-presence";
import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { recordSpotlightPlacementEvent } from "../api/spotlight-tracking-api";

interface SpotlightPlacementLinkProps {
  children: ReactNode;
  className?: string;
  href: string;
  placementId: string;
}

export function SpotlightPlacementLink({
  children,
  className,
  href,
  placementId
}: SpotlightPlacementLinkProps) {
  const rootRef = useRef<HTMLAnchorElement | null>(null);
  const impressionSentRef = useRef(false);
  const { authSession } = useAuthSession();

  useEffect(() => {
    const element = rootRef.current;

    if (!element || impressionSentRef.current || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];

        if (!entry?.isIntersecting || entry.intersectionRatio < 0.5 || impressionSentRef.current) {
          return;
        }

        impressionSentRef.current = true;
        const viewerKey = getOrCreateVisitorId();

        if (!viewerKey) {
          return;
        }

        void recordSpotlightPlacementEvent(
          placementId,
          "impression",
          viewerKey,
          authSession?.accessToken
        );
        observer.disconnect();
      },
      { threshold: [0.5] }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [authSession?.accessToken, placementId]);

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    const viewerKey = getOrCreateVisitorId();

    if (viewerKey) {
      void recordSpotlightPlacementEvent(
        placementId,
        "click",
        viewerKey,
        authSession?.accessToken
      );
    }

    return event;
  };

  return (
    <Link className={className} href={href} onClick={handleClick} ref={rootRef}>
      {children}
    </Link>
  );
}

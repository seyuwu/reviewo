"use client";

import { useEffect, useMemo, useState } from "react";

import {
  getEntityAvatarColor,
  getEntityInitials,
  resolveEntityAvatarCandidates
} from "../lib/entity-avatar";
import styles from "./entity-avatar.module.css";

interface EntityAvatarProps {
  canonicalUrl?: string | null;
  className?: string | undefined;
  entityId?: string;
  logoUrl?: string | null;
  size?: "sm" | "md" | "lg";
  title: string;
}

export function EntityAvatar({
  canonicalUrl = null,
  className,
  entityId,
  logoUrl,
  size = "md",
  title
}: EntityAvatarProps) {
  const candidates = useMemo(
    () => resolveEntityAvatarCandidates(logoUrl, canonicalUrl, size),
    [canonicalUrl, logoUrl, size]
  );
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);
  const seed = entityId ?? canonicalUrl ?? title;
  const imageSrc = candidates[candidateIndex] ?? null;
  const showImage = imageSrc !== null && !imageFailed;

  useEffect(() => {
    setCandidateIndex(0);
    setImageFailed(false);
  }, [candidates]);

  return (
    <span
      aria-hidden="true"
      className={[styles.avatar, styles[size], showImage ? styles.withImage : null, className]
        .filter(Boolean)
        .join(" ")}
      style={showImage ? undefined : { backgroundColor: getEntityAvatarColor(seed) }}
      title={title}
    >
      {showImage ? (
        <img
          alt=""
          className={styles.image}
          decoding="async"
          loading="lazy"
          onError={() => {
            if (candidateIndex < candidates.length - 1) {
              setCandidateIndex((currentIndex) => currentIndex + 1);
              return;
            }

            setImageFailed(true);
          }}
          referrerPolicy="no-referrer"
          src={imageSrc}
        />
      ) : (
        <span className={styles.initials}>{getEntityInitials(title, canonicalUrl)}</span>
      )}
    </span>
  );
}

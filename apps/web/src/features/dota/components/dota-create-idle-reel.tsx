"use client";

import { useEffect, useState } from "react";

import { useTranslation } from "../../i18n/locale-provider";
import styles from "./dota-create-idle-reel.module.css";

const IDLE_CLIPS = [
  {
    captionKey: "dota.create.idleCaption.rails",
    src: "/dota/idle/skate-front.mp4"
  },
  {
    captionKey: "dota.create.idleCaption.neon",
    src: "/dota/idle/skate-bowl.mp4"
  },
  {
    captionKey: "dota.create.idleCaption.forest",
    src: "/dota/idle/skate-ramps.mp4"
  }
] as const;

export function DotaCreateIdleReel() {
  const t = useTranslation();
  const [clipIndex, setClipIndex] = useState<number | null>(null);

  useEffect(() => {
    setClipIndex(Math.floor(Math.random() * IDLE_CLIPS.length));
  }, []);

  function showNextClip() {
    setClipIndex((current) => {
      if (current === null) {
        return 0;
      }

      return (current + 1) % IDLE_CLIPS.length;
    });
  }

  if (clipIndex === null) {
    return (
      <aside aria-hidden="true" className={styles.reel}>
        <div className={`${styles.frame} ${styles.framePlaceholder}`} />
      </aside>
    );
  }

  const clip = IDLE_CLIPS[clipIndex] ?? IDLE_CLIPS[0];

  return (
    <aside aria-hidden="true" className={styles.reel}>
      <div className={styles.frame}>
        <video
          autoPlay
          className={styles.video}
          key={clip.src}
          muted
          onEnded={showNextClip}
          playsInline
          preload="metadata"
        >
          <source src={clip.src} type="video/mp4" />
        </video>
      </div>
      <p className={styles.caption}>{t(clip.captionKey)}</p>
    </aside>
  );
}

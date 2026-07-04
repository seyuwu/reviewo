"use client";

import { useTranslation } from "../../i18n/locale-provider";
import { buildTelegramShareUrl, buildVkShareUrl, buildXShareUrl } from "../lib/share-urls";

interface SocialShareButtonsProps {
  pageUrl: string;
  text: string;
}

export function SocialShareButtons({ pageUrl, text }: SocialShareButtonsProps) {
  const t = useTranslation();

  return (
    <div className="growth-social-buttons">
      <a
        className="growth-social-button"
        href={buildTelegramShareUrl(pageUrl, text)}
        rel="noopener noreferrer"
        target="_blank"
      >
        {t("growth.share.telegram")}
      </a>
      <a
        className="growth-social-button"
        href={buildVkShareUrl(pageUrl)}
        rel="noopener noreferrer"
        target="_blank"
      >
        {t("growth.share.vk")}
      </a>
      <a
        className="growth-social-button"
        href={buildXShareUrl(pageUrl, text)}
        rel="noopener noreferrer"
        target="_blank"
      >
        {t("growth.share.x")}
      </a>
    </div>
  );
}

import type { BattlePairListItem } from "../types/discovery";

const FALLBACK_PAIRS: BattlePairListItem[] = [
  {
    isSuggested: true,
    leftCanonicalUrl: "https://www.youtube.com",
    leftEntityId: "",
    leftLabel: "YouTube",
    leftLogoUrl: null,
    leftPercent: 0,
    leftSlug: "youtube",
    pairSlug: "youtube-vs-github-com",
    rightCanonicalUrl: "https://github.com",
    rightEntityId: "",
    rightLabel: "GitHub",
    rightLogoUrl: null,
    rightPercent: 0,
    rightSlug: "github-com",
    totalVotes: 0
  },
  {
    isSuggested: true,
    leftCanonicalUrl: "https://telegram.org",
    leftEntityId: "",
    leftLabel: "Telegram",
    leftLogoUrl: null,
    leftPercent: 0,
    leftSlug: "telegram",
    pairSlug: "telegram-vs-whatsapp",
    rightCanonicalUrl: "https://www.whatsapp.com",
    rightEntityId: "",
    rightLabel: "WhatsApp",
    rightLogoUrl: null,
    rightPercent: 0,
    rightSlug: "whatsapp",
    totalVotes: 0
  }
];

export function getFallbackBattlePairsFromClient(): BattlePairListItem[] {
  return FALLBACK_PAIRS;
}

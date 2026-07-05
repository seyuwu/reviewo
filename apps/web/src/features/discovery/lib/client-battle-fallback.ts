import type { BattlePairListItem } from "../types/discovery";

const FALLBACK_PAIRS: BattlePairListItem[] = [
  {
    isSuggested: true,
    leftEntityId: "",
    leftLabel: "YouTube",
    leftPercent: 0,
    leftSlug: "youtube",
    pairSlug: "youtube-vs-github-com",
    rightEntityId: "",
    rightLabel: "GitHub",
    rightPercent: 0,
    rightSlug: "github-com",
    totalVotes: 0
  },
  {
    isSuggested: true,
    leftEntityId: "",
    leftLabel: "Telegram",
    leftPercent: 0,
    leftSlug: "telegram",
    pairSlug: "telegram-vs-whatsapp",
    rightEntityId: "",
    rightLabel: "WhatsApp",
    rightPercent: 0,
    rightSlug: "whatsapp",
    totalVotes: 0
  }
];

export function getFallbackBattlePairsFromClient(): BattlePairListItem[] {
  return FALLBACK_PAIRS;
}

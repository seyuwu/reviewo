const SENTENCE_BOUNDARY = /(?<=[.!?…])\s+/u;

export function formatReviewSnippet(text: string, maxSentences = 2): string {
  const normalized = text.trim().replace(/\s+/g, " ");

  if (!normalized) {
    return "";
  }

  const sentences = normalized.split(SENTENCE_BOUNDARY).filter(Boolean);

  if (sentences.length <= maxSentences) {
    return normalized;
  }

  return `${sentences.slice(0, maxSentences).join(" ")}…`;
}

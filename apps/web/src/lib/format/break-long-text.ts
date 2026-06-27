const ZERO_WIDTH_SPACE = "\u200b";
const MAX_UNBROKEN_RUN = 32;

/** Inserts break opportunities into long unbroken words (e.g. digit strings). */
export function breakLongUnbrokenText(text: string): string {
  return text.replace(/\S+/g, (word) => {
    if (word.length <= MAX_UNBROKEN_RUN) {
      return word;
    }

    const chunks: string[] = [];

    for (let index = 0; index < word.length; index += MAX_UNBROKEN_RUN) {
      chunks.push(word.slice(index, index + MAX_UNBROKEN_RUN));
    }

    return chunks.join(ZERO_WIDTH_SPACE);
  });
}

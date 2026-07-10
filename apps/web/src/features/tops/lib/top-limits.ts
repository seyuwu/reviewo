const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const CYRILLIC_REPLACEMENTS: Array<[RegExp, string]> = [
  [/щ/g, "shch"],
  [/ш/g, "sh"],
  [/ч/g, "ch"],
  [/ж/g, "zh"],
  [/х/g, "kh"],
  [/ц/g, "ts"],
  [/ю/g, "yu"],
  [/я/g, "ya"],
  [/ё/g, "e"],
  [/ъ|ь/g, ""],
  [/а/g, "a"],
  [/б/g, "b"],
  [/в/g, "v"],
  [/г/g, "g"],
  [/д/g, "d"],
  [/е/g, "e"],
  [/з/g, "z"],
  [/и/g, "i"],
  [/й/g, "y"],
  [/к/g, "k"],
  [/л/g, "l"],
  [/м/g, "m"],
  [/н/g, "n"],
  [/о/g, "o"],
  [/п/g, "p"],
  [/р/g, "r"],
  [/с/g, "s"],
  [/т/g, "t"],
  [/у/g, "u"],
  [/ф/g, "f"],
  [/ы/g, "y"],
  [/э/g, "e"]
];

function transliterateForSlug(value: string): string {
  let result = value.toLowerCase();

  for (const [pattern, replacement] of CYRILLIC_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }

  return result;
}

export function slugifyTopTitle(title: string): string {
  const slug = transliterateForSlug(title)
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);

  return slug || "top";
}

export function isValidTopSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug) && !slug.startsWith("system-");
}

export const MIN_TOP_ITEMS = 3;
export const MAX_TOP_ITEMS = 50;
export const MAX_TOP_NOTE_LENGTH = 280;

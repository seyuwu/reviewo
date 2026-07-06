import { createHash } from "node:crypto";

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

export function createSlug(value: string): string {
  const transliterated = transliterateForSlug(value);
  const slug = transliterated
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);

  if (slug) {
    return slug;
  }

  const digest = createHash("sha256").update(value.trim().toLowerCase()).digest("hex").slice(0, 8);

  return `entity-${digest}`;
}

export function createSlugFromCanonicalUrl(canonicalUrl: string): string {
  const url = new URL(canonicalUrl);
  const raw =
    url.pathname === "/"
      ? url.hostname
      : `${url.hostname}${url.pathname}${url.search}`;

  return createSlug(raw);
}

function transliterateForSlug(value: string): string {
  let result = value.toLowerCase();

  for (const [pattern, replacement] of CYRILLIC_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }

  return result;
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugifyTopTitle(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
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

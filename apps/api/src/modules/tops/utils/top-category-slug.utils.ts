const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugifyTopCategoryTitle(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return slug || "category";
}

export function isValidTopCategorySlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}

export function normalizeTopCategoryTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ");
}

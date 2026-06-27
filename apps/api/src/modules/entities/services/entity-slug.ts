export function createSlug(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);

  return slug || "entity";
}

export function createSlugFromCanonicalUrl(canonicalUrl: string): string {
  const url = new URL(canonicalUrl);
  const raw =
    url.pathname === "/"
      ? url.hostname
      : `${url.hostname}${url.pathname}${url.search}`;

  return createSlug(raw);
}

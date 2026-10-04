const RESERVED_GAMES_ROUTES = new Set(["search", "community", "tournaments"]);

/** Keep actual Games routes separate from shortened Dota profile links. */
export function resolveDotaMarketingProfileRedirect(pathname: string): string | null {
  const slug = pathname.match(/^\/games\/([^/]+)\/?$/)?.[1];
  return slug && !RESERVED_GAMES_ROUTES.has(slug) ? `/dota/${slug}` : null;
}

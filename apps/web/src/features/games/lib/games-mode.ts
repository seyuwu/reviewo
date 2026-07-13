export function isGamesModePath(pathname: string): boolean {
  return pathname === "/games" || pathname.startsWith("/games/") || pathname.startsWith("/dota");
}

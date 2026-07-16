import { NextResponse, type NextRequest } from "next/server";

const GAMES_HOSTS = new Set(["games.opinia.ru", "games.localhost"]);
const DOTA_HOSTS = new Set(["dota.opinia.ru", "dota.localhost"]);

function normalizeHost(hostHeader: string | null): string {
  if (!hostHeader) {
    return "";
  }

  return hostHeader.split(":")[0]?.toLowerCase() ?? "";
}

export function middleware(request: NextRequest) {
  const host = normalizeHost(request.headers.get("host"));
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/_next") || pathname.startsWith("/api") || pathname.includes(".")) {
    return NextResponse.next();
  }

  // games.* → Games vertical entry
  if (GAMES_HOSTS.has(host) && pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/games/search";
    return NextResponse.redirect(url);
  }

  // dota.* → Dota entry (search for now; can switch to /dota later)
  if (DOTA_HOSTS.has(host) && pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/games/search";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"]
};

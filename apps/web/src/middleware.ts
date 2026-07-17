import { NextResponse, type NextRequest } from "next/server";

const GAMES_HOSTS = new Set(["games.opinia.ru", "games.localhost"]);
const DOTA_HOSTS = new Set(["dota.opinia.ru", "dota.localhost"]);
const APEX_HOSTS = new Set(["opinia.ru", "www.opinia.ru"]);

function normalizeHost(hostHeader: string | null): string {
  if (!hostHeader) {
    return "";
  }

  return hostHeader.split(":")[0]?.toLowerCase() ?? "";
}

function redirectToSubdomain(
  request: NextRequest,
  subdomain: "games" | "dota"
): NextResponse {
  const url = request.nextUrl.clone();
  url.hostname = `${subdomain}.opinia.ru`;
  url.protocol = "https:";
  url.port = "";
  return NextResponse.redirect(url);
}

export function middleware(request: NextRequest) {
  const host = normalizeHost(request.headers.get("host"));
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/_next") || pathname.startsWith("/api") || pathname.includes(".")) {
    return NextResponse.next();
  }

  // Canonicalize games/dota paths on the apex site to product hosts.
  if (APEX_HOSTS.has(host)) {
    if (pathname === "/games" || pathname.startsWith("/games/")) {
      return redirectToSubdomain(request, "games");
    }

    if (pathname === "/dota" || pathname.startsWith("/dota/")) {
      return redirectToSubdomain(request, "dota");
    }
  }

  // games.* → Games vertical entry (waitlist or live search)
  if (GAMES_HOSTS.has(host) && pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/games/search";
    return NextResponse.redirect(url);
  }

  // dota.* → Dota landing (not search/waitlist — matching stays under /games/search)
  if (DOTA_HOSTS.has(host) && pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/dota";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"]
};

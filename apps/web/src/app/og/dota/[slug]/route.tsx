import { ImageResponse } from "next/og";

import type { DotaProfile } from "../../../../features/dota/types/dota";
import { serverApiRequest } from "../../../../lib/api/server-api-client";

export const runtime = "edge";

interface OgDotaRouteProps {
  params: Promise<{
    slug: string;
  }>;
}

export async function GET(_request: Request, { params }: OgDotaRouteProps) {
  const { slug } = await params;

  if (slug === "dota") {
    return renderFallback("Opinia Dota", "Профили с подтверждениями от тиммейтов");
  }

  let profile: DotaProfile;

  try {
    profile = await serverApiRequest<DotaProfile>(`/dota/profiles/${encodeURIComponent(slug)}`);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const topQualities = Object.entries(profile.qualities)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([key, count]) => `${labelForQuality(key)}: ${count}`)
    .join(" · ");

  return renderFallback(
    profile.title,
    `ID ${profile.dotaAccountId} · MMR ${profile.mmr ?? "—"} · ${profile.progress.current}/${profile.progress.target} confirmations`,
    topQualities
  );
}

function labelForQuality(key: string): string {
  const labels: Record<string, string> = {
    play_again: "Party again",
    has_mic: "Mic",
    adequate: "Decent",
    team_player: "Team",
    good_caller: "Caller",
    toxic: "Toxic",
    tilts: "Tilts",
    leaves: "Leaves",
    ruins: "Ruins"
  };

  return labels[key] ?? key;
}

function renderFallback(title: string, subtitle: string, extra?: string) {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "flex-start",
          background: "linear-gradient(145deg, #0f172a, #1e293b)",
          color: "#ffffff",
          display: "flex",
          flexDirection: "column",
          fontFamily: "sans-serif",
          height: "100%",
          justifyContent: "space-between",
          padding: "64px",
          width: "100%"
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          <div style={{ color: "#86efac", fontSize: 28, fontWeight: 700 }}>Opinia Dota</div>
          <div style={{ fontSize: 56, fontWeight: 700, lineHeight: 1.1 }}>{title}</div>
          <div style={{ color: "rgba(255,255,255,0.82)", fontSize: 30 }}>{subtitle}</div>
          {extra ? <div style={{ color: "rgba(255,255,255,0.72)", fontSize: 24 }}>{extra}</div> : null}
        </div>
        <div style={{ color: "#d4af37", fontSize: 28, fontWeight: 700 }}>dota.opinia.ru</div>
      </div>
    ),
    {
      height: 630,
      width: 1200
    }
  );
}

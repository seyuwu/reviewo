import { ImageResponse } from "next/og";

import type { GameParty } from "../../../../../features/social/types/social";
import { serverApiRequest } from "../../../../../lib/api/server-api-client";

export const runtime = "edge";

interface OgDotaTeamRouteProps {
  params: Promise<{
    slug: string;
  }>;
}

export async function GET(_request: Request, { params }: OgDotaTeamRouteProps) {
  const { slug } = await params;

  let party: GameParty;

  try {
    party = await serverApiRequest<GameParty>(`/social/parties/${encodeURIComponent(slug)}`);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const seatsLeft = Math.max(0, party.maxMembers - party.memberCount);
  const joinMode =
    (party.joinMode ?? "OPEN") === "OPEN" ? "Open join" : "Confirm to join";
  const claimed = new Set(
    party.members.map((member) => member.positionRole).filter(Boolean)
  );
  const neededRoles = (["1", "2", "3", "4", "5"] as const)
    .filter((role) => !claimed.has(role))
    .join(" · ");
  const mmrValues = party.members
    .map((member) => Number(member.mmr))
    .filter((value) => Number.isFinite(value) && value > 0);
  const avgMmr =
    mmrValues.length > 0
      ? Math.round(mmrValues.reduce((sum, value) => sum + value, 0) / mmrValues.length)
      : null;

  return renderPartyCard(
    party.name,
    `${party.memberCount}/${party.maxMembers} · ${seatsLeft} left · ${joinMode}`,
    [
      neededRoles ? `Need: ${neededRoles}` : null,
      avgMmr != null ? `Avg MMR ≈ ${avgMmr}` : null
    ]
      .filter(Boolean)
      .join(" · ")
  );
}

function renderPartyCard(title: string, subtitle: string, extra?: string) {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "flex-start",
          background: "linear-gradient(145deg, #12081f, #1a1030 45%, #0b0e14)",
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
          <div style={{ color: "#c4b5fd", fontSize: 28, fontWeight: 700 }}>Opinia Party</div>
          <div style={{ fontSize: 56, fontWeight: 700, lineHeight: 1.1 }}>{title}</div>
          <div style={{ color: "rgba(255,255,255,0.82)", fontSize: 30 }}>{subtitle}</div>
          {extra ? <div style={{ color: "rgba(255,255,255,0.72)", fontSize: 24 }}>{extra}</div> : null}
        </div>
        <div style={{ color: "#a78bfa", fontSize: 28, fontWeight: 700 }}>dota.opinia.ru</div>
      </div>
    ),
    {
      height: 630,
      width: 1200
    }
  );
}

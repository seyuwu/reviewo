import { ImageResponse } from "next/og";

import type { GameParty } from "../../../../../features/social/types/social";
import { serverApiRequest } from "../../../../../lib/api/server-api-client";

export const runtime = "edge";
export const dynamic = "force-dynamic";
export const revalidate = 0;

interface OgDotaTeamRouteProps {
  params: Promise<{
    slug: string;
  }>;
}

export async function GET(_request: Request, { params }: OgDotaTeamRouteProps) {
  const { slug } = await params;

  let party: GameParty;

  try {
    party = await serverApiRequest<GameParty>(`/social/parties/${encodeURIComponent(slug)}`, {
      cache: "no-store"
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const seatsLeft = Math.max(0, party.maxMembers - party.memberCount);
  const joinMode = (party.joinMode ?? "OPEN") === "OPEN" ? "Open join" : "Confirm to join";
  const claimed = new Set(party.members.map((member) => member.positionRole).filter(Boolean));
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

  const card = renderPartyCard(
    party.name,
    `${party.memberCount}/${party.maxMembers} · ${seatsLeft} left · ${joinMode}`,
    [neededRoles ? `Need: ${neededRoles}` : null, avgMmr != null ? `Avg MMR ≈ ${avgMmr}` : null]
      .filter(Boolean)
      .join(" · "),
    party.members.map((member) => ({
      name: member.displayName,
      role: member.positionRole,
      mmr: member.mmr
    }))
  );
  card.headers.set("Cache-Control", "no-store, max-age=0");
  return card;
}

function renderPartyCard(
  title: string,
  subtitle: string,
  extra?: string,
  members: Array<{ name: string; role: string | null; mmr: string | null }> = []
) {
  const roleNames: Record<string, string> = {
    "1": "Carry",
    "2": "Mid",
    "3": "Offlane",
    "4": "Support",
    "5": "Hard support"
  };
  return new ImageResponse(
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
        {extra ? (
          <div style={{ color: "rgba(255,255,255,0.72)", fontSize: 24 }}>{extra}</div>
        ) : null}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "8px" }}>
          {members.slice(0, 5).map((member, index) => (
            <div
              key={`${member.name}-${index}`}
              style={{ color: "rgba(255,255,255,0.9)", display: "flex", fontSize: 22 }}
            >
              {member.name} · {member.role ? (roleNames[member.role] ?? member.role) : "No role"} ·{" "}
              {member.mmr ?? "—"} MMR
            </div>
          ))}
        </div>
      </div>
      <div style={{ color: "#a78bfa", fontSize: 28, fontWeight: 700 }}>dota.opinia.ru</div>
    </div>,
    {
      height: 630,
      width: 1200
    }
  );
}

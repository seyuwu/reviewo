import { ImageResponse } from "next/og";

import type { DotaPositionRole, GameParty, GamePartyMember } from "../../../../../features/social/types/social";
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

  const card = renderPartyCard(party);
  card.headers.set("Cache-Control", "no-store, max-age=0");
  return card;
}

const POSITION_ROLES: DotaPositionRole[] = ["1", "2", "3", "4", "5"];

const ROLE_NAMES: Record<DotaPositionRole, string> = {
  "1": "Керри",
  "2": "Мид",
  "3": "Оффлейн",
  "4": "Саппорт",
  "5": "Хард-саппорт"
};

function renderPartyCard(party: GameParty) {
  const claimedRoles = new Set(
    party.members
      .map((member) => member.positionRole)
      .filter((role): role is DotaPositionRole => role !== null)
  );
  const recruitedRoles = new Set(party.recruitedRoles ?? []);
  const freeRoles = POSITION_ROLES.filter((role) => !claimedRoles.has(role));
  const activelySearchedRoles = freeRoles.filter((role) => recruitedRoles.has(role));
  const captain = party.members.find((member) => member.role === "OWNER") ?? party.members[0];
  const captainMmr = captain?.mmr ? ` · ≈ ${formatNumber(captain.mmr)} MMR` : "";
  const joinModeLabel = party.joinMode === "CONFIRM" ? "По заявке" : "Сразу в пати";
  const partyExpiresAt = formatExpiry(party.expiresAt);
  const searchExpiresAt = formatExpiry(party.recruitingUntil);
  const activeRolesLabel = activelySearchedRoles.map((role) => ROLE_NAMES[role]).join(" · ");

  return new ImageResponse(
    <div
      style={{
        background: "#0b0e14",
        color: "#f5f3ff",
        display: "flex",
        fontFamily: "sans-serif",
        height: "100%",
        padding: 16,
        width: "100%"
      }}
    >
      <div
        style={{
          background:
            "radial-gradient(ellipse at 94% 0%, rgba(109,74,255,0.22), transparent 38%), linear-gradient(180deg, rgba(24,28,42,0.98), rgba(12,14,23,0.98))",
          border: "1px solid rgba(147,130,255,0.24)",
          borderRadius: 24,
          display: "flex",
          flex: 1,
          flexDirection: "column",
          gap: 12,
          overflow: "hidden",
          padding: 22,
          position: "relative"
        }}
      >
        <div
          style={{
            alignItems: "center",
            display: "flex",
            justifyContent: "space-between",
            minHeight: 76
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
            <div style={{ color: "#c4b5fd", fontSize: 17, fontWeight: 800, letterSpacing: 1.2 }}>
              ПАТИ DOTA 2
            </div>
            <div
              style={{
                color: "#ffffff",
                fontSize: 46,
                fontWeight: 800,
                lineHeight: 1,
                maxWidth: 1040,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap"
              }}
            >
              {party.name}
            </div>
            <div style={{ color: "#a9aec2", display: "flex", fontSize: 19 }}>
              <span style={{ color: "#fbbf24", fontWeight: 800 }}>КАПИТАН</span>
              <span style={{ color: "#d9d5e8", fontWeight: 700 }}>
                {captain ? ` · ${captain.displayName}` : " не назначен"}
              </span>
              {captainMmr ? <span>{captainMmr}</span> : null}
            </div>
          </div>
          <div
            style={{
              alignItems: "center",
              background: "rgba(109,74,255,0.18)",
              border: "1px solid rgba(167,139,250,0.42)",
              borderRadius: 999,
              color: "#ddd6fe",
              display: "flex",
              flexShrink: 0,
              fontSize: 16,
              fontWeight: 800,
              padding: "10px 16px"
            }}
          >
            {party.visibility === "PRIVATE" ? "ЗАКРЫТАЯ ПАТИ" : "ОТКРЫТАЯ ПАТИ"}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, height: 66 }}>
          <MetricCard label="СОСТАВ" value={`${party.memberCount} / ${party.maxMembers} игроков`} />
          <MetricCard label="СВОБОДНЫЕ МЕСТА" value={freePlacesLabel(Math.max(0, party.maxMembers - party.memberCount))} />
          <MetricCard label="ВСТУПЛЕНИЕ" value={joinModeLabel} />
          <MetricCard label="ПАТИ ДО" value={partyExpiresAt} />
        </div>

        <div
          style={{
            alignItems: "center",
            background: activelySearchedRoles.length
              ? "linear-gradient(100deg, #8b5cf6, #652be0)"
              : "linear-gradient(100deg, rgba(109,74,255,0.2), rgba(55,46,84,0.52))",
            border: activelySearchedRoles.length
              ? "1px solid rgba(221,214,254,0.32)"
              : "1px solid rgba(147,130,255,0.2)",
            borderRadius: 16,
            color: "#ffffff",
            display: "flex",
            height: 54,
            justifyContent: "space-between",
            padding: "0 20px"
          }}
        >
          <div style={{ alignItems: "center", display: "flex", fontSize: 22, fontWeight: 800 }}>
            <span
              style={{
                background: "rgba(255,255,255,0.16)",
                borderRadius: 999,
                fontSize: 12,
                letterSpacing: 0.4,
                marginRight: 10,
                padding: "5px 9px"
              }}
            >
              {activelySearchedRoles.length ? "АВТО" : "ПАТИ"}
            </span>
            {activelySearchedRoles.length ? "Ищем игроков" : "Набор пока не запущен"}
          </div>
          <div style={{ color: "rgba(255,255,255,0.9)", display: "flex", fontSize: 17, fontWeight: 700 }}>
            {activelySearchedRoles.length
              ? `${activeRolesLabel} · ${joinModeLabel}`
              : freePlacesLabel(freeRoles.length)}
          </div>
        </div>

        <div style={{ display: "flex", flex: 1, gap: 10, minHeight: 0 }}>
          {POSITION_ROLES.map((role) => {
            const member = party.members.find((item) => item.positionRole === role);
            const isRecruiting = !member && recruitedRoles.has(role);

            return (
              <SlotCard
                key={role}
                member={member}
                recruiting={isRecruiting}
                role={role}
              />
            );
          })}
        </div>

        <div
          style={{
            alignItems: "center",
            color: "#858ba2",
            display: "flex",
            fontSize: 15,
            justifyContent: "space-between",
            padding: "0 2px"
          }}
        >
          <span>dota.opinia.ru · Поиск игроков для Dota 2</span>
          <span style={{ color: activelySearchedRoles.length ? "#86efac" : "#a78bfa", fontWeight: 700 }}>
            {activelySearchedRoles.length
              ? `Поиск до ${searchExpiresAt}`
              : "Соберите свою команду"}
          </span>
        </div>
      </div>
    </div>,
    {
      height: 600,
      width: 1560
    }
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "rgba(9,10,20,0.72)",
        border: "1px solid rgba(147,130,255,0.18)",
        borderRadius: 14,
        display: "flex",
        flex: 1,
        flexDirection: "column",
        gap: 5,
        justifyContent: "center",
        minWidth: 0,
        padding: "8px 14px"
      }}
    >
      <span style={{ color: "#9da3ba", fontSize: 13, fontWeight: 800, letterSpacing: 0.5 }}>
        {label}
      </span>
      <span
        style={{
          color: "#f5f3ff",
          fontSize: 19,
          fontWeight: 800,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap"
        }}
      >
        {value}
      </span>
    </div>
  );
}

function SlotCard({
  member,
  recruiting,
  role
}: {
  member: GamePartyMember | undefined;
  recruiting: boolean;
  role: DotaPositionRole;
}) {
  const accent = recruiting ? "#6d4aff" : "#8b5cf6";

  return (
    <div
      style={{
        alignItems: "center",
        background: member
          ? "linear-gradient(180deg, rgba(30,24,52,0.94), rgba(15,15,27,0.94))"
          : recruiting
            ? "linear-gradient(180deg, rgba(34,24,62,0.95), rgba(15,14,27,0.96))"
            : "linear-gradient(180deg, rgba(21,22,37,0.88), rgba(13,15,24,0.92))",
        border: `1px solid ${recruiting ? "rgba(109,74,255,0.58)" : "rgba(147,130,255,0.2)"}`,
        borderRadius: 18,
        display: "flex",
        flex: 1,
        flexDirection: "column",
        justifyContent: "space-between",
        minWidth: 0,
        padding: "14px 12px 12px"
      }}
    >
      <div style={{ alignItems: "center", color: "#c4b5fd", display: "flex", fontSize: 15, fontWeight: 800 }}>
        <span
          style={{
            alignItems: "center",
            background: "rgba(109,74,255,0.25)",
            borderRadius: 999,
            display: "flex",
            height: 24,
            justifyContent: "center",
            marginRight: 7,
            width: 24
          }}
        >
          {role}
        </span>
        {ROLE_NAMES[role].toLocaleUpperCase("ru-RU")}
      </div>

      <div
        style={{
          alignItems: "center",
          display: "flex",
          flex: 1,
          flexDirection: "column",
          gap: 9,
          justifyContent: "center",
          minHeight: 0
        }}
      >
      {member ? (
        <div style={{ alignItems: "center", display: "flex", flexDirection: "column", gap: 8 }}>
          <div
            style={{
              alignItems: "center",
              background: "linear-gradient(145deg, #7c5cff, #4f2fd4)",
              border: "2px solid rgba(196,181,253,0.35)",
              borderRadius: 999,
              boxShadow: "0 0 22px rgba(109,74,255,0.35)",
              color: "#ffffff",
              display: "flex",
              fontSize: 28,
              fontWeight: 800,
              height: 58,
              justifyContent: "center",
              width: 58
            }}
          >
            {initial(member.displayName)}
          </div>
          <div style={{ alignItems: "center", display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
            <div
              style={{
                color: "#ffffff",
                fontSize: 20,
                fontWeight: 800,
                maxWidth: "100%",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap"
              }}
            >
              {member.displayName}
            </div>
            <div style={{ color: member.role === "OWNER" ? "#c4b5fd" : "#a9aec2", display: "flex", fontSize: 15 }}>
              {member.role === "OWNER" ? "Капитан" : "Игрок"}
              {member.mmr ? <span style={{ color: "#86efac", fontWeight: 800 }}> · {formatNumber(member.mmr)} MMR</span> : null}
            </div>
          </div>
        </div>
      ) : recruiting ? (
        <>
          <div style={{ alignItems: "center", color: "#e9ddff", display: "flex", flexDirection: "column", gap: 12 }}>
            <span style={{ color: accent, fontSize: 13, fontWeight: 800, letterSpacing: 1 }}>ПОИСК</span>
            <span style={{ fontSize: 18, fontWeight: 800, textAlign: "center" }}>Ищем игрока на слот</span>
          </div>
        </>
      ) : (
        <>
          <div style={{ alignItems: "center", color: "#a9aec2", display: "flex", flexDirection: "column", gap: 10 }}>
            <span
              style={{
                alignItems: "center",
                border: "1px dashed rgba(255,255,255,0.24)",
                borderRadius: 999,
                color: "#9da3ba",
                display: "flex",
                fontSize: 30,
                height: 58,
                justifyContent: "center",
                width: 58
              }}
            >
              +
            </span>
            <span style={{ fontSize: 18, fontWeight: 800 }}>Свободное место</span>
          </div>
        </>
      )}
      </div>
      <StatusPill
        color={member ? "#a78bfa" : recruiting ? "#86efac" : "#9da3ba"}
        text={member ? "В СОСТАВЕ" : recruiting ? "ПОДБОР АКТИВЕН" : "СВОБОДНО"}
      />
    </div>
  );
}

function StatusPill({ color, text }: { color: string; text: string }) {
  return (
    <div
      style={{
        alignItems: "center",
        border: `1px solid ${color}55`,
        borderRadius: 999,
        color,
        display: "flex",
        fontSize: 12,
        fontWeight: 800,
        justifyContent: "center",
        minHeight: 24,
        padding: "2px 9px"
      }}
    >
      {text}
    </div>
  );
}

function initial(name: string): string {
  return Array.from(name.trim())[0]?.toLocaleUpperCase("ru-RU") ?? "?";
}

function formatNumber(value: string): string {
  const number = Number(value);
  return Number.isFinite(number) ? new Intl.NumberFormat("ru-RU").format(number) : value;
}

function formatExpiry(value: string | null | undefined): string {
  if (!value) {
    return "Без ограничения";
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "—";
  }
  return `${new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC"
  }).format(date)} UTC`;
}

function freePlacesLabel(count: number): string {
  if (count === 0) {
    return "Нет свободных мест";
  }
  if (count === 1) {
    return "1 свободное место";
  }
  if (count < 5) {
    return `${count} свободных места`;
  }
  return `${count} свободных мест`;
}

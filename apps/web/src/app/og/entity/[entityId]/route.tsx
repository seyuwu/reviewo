import { ImageResponse } from "next/og";

import { serverApiRequest } from "../../../../lib/api/server-api-client";
import type { EntityPageResponse } from "../../../../features/entity-page/types/entity-page";

export const runtime = "edge";

interface OgEntityRouteProps {
  params: Promise<{
    entityId: string;
  }>;
}

export async function GET(_request: Request, { params }: OgEntityRouteProps) {
  const { entityId } = await params;

  let pageData: EntityPageResponse;

  try {
    pageData = await serverApiRequest<EntityPageResponse>(`/entities/${entityId}/page`);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const stars = formatStars(pageData.rating.avgScore);
  const trustPercent = Math.round(pageData.trust.confidence * 100);

  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "flex-start",
          background: "linear-gradient(145deg, #171717, #262626)",
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
          <div style={{ fontSize: 56, fontWeight: 700, lineHeight: 1.1 }}>{pageData.entity.title}</div>
          <div style={{ alignItems: "center", display: "flex", gap: "18px", fontSize: 34 }}>
            <span>{stars}</span>
            <span style={{ fontWeight: 700 }}>{pageData.rating.avgScore.toFixed(1)}/5</span>
          </div>
          <div style={{ color: "rgba(255,255,255,0.78)", fontSize: 28 }}>
            {trustPercent}% trust · {pageData.meta.reviewsCount} reviews
          </div>
        </div>
        <div style={{ color: "#d4af37", fontSize: 28, fontWeight: 700 }}>opinia.ru</div>
      </div>
    ),
    {
      height: 630,
      width: 1200
    }
  );
}

function formatStars(score: number): string {
  const rounded = Math.max(0, Math.min(5, Math.round(score)));

  return `${"★".repeat(rounded)}${"☆".repeat(5 - rounded)}`;
}

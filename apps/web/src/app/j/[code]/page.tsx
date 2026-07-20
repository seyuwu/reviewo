import { notFound, redirect } from "next/navigation";

import { publicEnv } from "../../../lib/config/public-env";

interface ShortJoinPageProps {
  params: Promise<{
    code: string;
  }>;
}

function getServerApiBaseUrl(): string {
  const internalBaseUrl = process.env.API_INTERNAL_BASE_URL?.trim();

  if (internalBaseUrl) {
    return internalBaseUrl;
  }

  return publicEnv.apiBaseUrl;
}

export default async function ShortPartyJoinPage({ params }: ShortJoinPageProps) {
  const { code: rawCode } = await params;
  const code = rawCode.trim();

  if (!/^[A-Za-z0-9_-]{6,16}$/.test(code)) {
    notFound();
  }

  let slug: string;

  try {
    const response = await fetch(
      new URL(`/social/parties/join-codes/${encodeURIComponent(code)}`, getServerApiBaseUrl()),
      { cache: "no-store" }
    );

    if (!response.ok) {
      notFound();
    }

    const body = (await response.json()) as { slug?: string };

    if (!body.slug) {
      notFound();
    }

    slug = body.slug;
  } catch {
    notFound();
  }

  redirect(`/dota/teams/${encodeURIComponent(slug)}?join=${encodeURIComponent(code)}`);
}

import { notFound, redirect } from "next/navigation";

import type { DotaProfile } from "../../../../features/dota/types/dota";
import { serverApiRequest } from "../../../../lib/api/server-api-client";

interface DotaIdRedirectPageProps {
  params: Promise<{
    accountId: string;
  }>;
}

export default async function DotaIdRedirectPage({ params }: DotaIdRedirectPageProps) {
  const { accountId } = await params;

  try {
    const profile = await serverApiRequest<DotaProfile>(
      `/dota/profiles/by-id/${encodeURIComponent(accountId)}`
    );

    redirect(`/dota/${profile.slug}`);
  } catch {
    notFound();
  }
}

import { redirect } from "next/navigation";

interface BattlePageProps {
  params: Promise<{
    pairSlug: string;
  }>;
}

export default async function BattlePage({ params }: BattlePageProps) {
  const { pairSlug } = await params;
  redirect(`/compare/${pairSlug}`);
}

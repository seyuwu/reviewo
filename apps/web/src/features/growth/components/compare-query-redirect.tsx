"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { useTranslation } from "../../i18n/locale-provider";
import { fetchGrowthCompareByEntityIds } from "../api/growth-api";

export function CompareQueryRedirect() {
  const t = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const left = searchParams.get("left")?.trim();
    const right = searchParams.get("right")?.trim();

    if (!left || !right) {
      setFailed(true);
      return;
    }

    let cancelled = false;

    void fetchGrowthCompareByEntityIds(left, right)
      .then((compare) => {
        if (!cancelled) {
          router.replace(`/compare/${compare.pairSlug}`);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  if (failed) {
    return (
      <main className="shell">
        <section className="creation-card entity-placeholder-card">
          <h1>{t("web.entity.unavailable")}</h1>
          <p className="hero-copy">{t("web.entity.unavailableHint")}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <p className="muted-copy">{t("web.home.searching")}</p>
    </main>
  );
}

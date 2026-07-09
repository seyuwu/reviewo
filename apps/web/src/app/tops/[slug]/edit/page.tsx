"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { TopEditorView } from "../../../../features/tops/components/top-editor-view";
import { fetchTopBySlug } from "../../../../features/tops/api/tops-api";
import { useAuthSession } from "../../../../features/auth/hooks/use-auth-session";
import { useTranslation } from "../../../../features/i18n/locale-provider";
import type { Top } from "../../../../features/tops/types/tops";

export default function EditTopPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const t = useTranslation();
  const { authSession, isAuthSessionLoaded } = useAuthSession();
  const [top, setTop] = useState<Top | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void fetchTopBySlug(params.slug, authSession?.accessToken)
      .then((response: Top) => {
        if (!cancelled) {
          setTop(response);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTop(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authSession?.accessToken, params.slug]);

  useEffect(() => {
    if (!isAuthSessionLoaded || isLoading || !top) {
      return;
    }

    if (!authSession?.accessToken) {
      router.replace(`/tops/${params.slug}`);
      return;
    }

    if (!top.isOwnTop) {
      router.replace(`/tops/${params.slug}`);
    }
  }, [authSession?.accessToken, isAuthSessionLoaded, isLoading, params.slug, router, top]);

  if (isLoading) {
    return (
      <main className="shell shell-home">
        <p className="muted-copy">{t("chat.loading")}</p>
      </main>
    );
  }

  if (!top || !top.isOwnTop) {
    return null;
  }

  return (
    <main className="shell shell-home">
      <TopEditorView mode="edit" initialTop={top} />
    </main>
  );
}

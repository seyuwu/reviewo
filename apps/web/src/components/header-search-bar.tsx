"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useId, useState } from "react";

import { useTranslation } from "../features/i18n/locale-provider";

export function HeaderSearchBar() {
  const t = useTranslation();
  const inputId = useId();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (pathname === "/search") {
      setQuery(searchParams.get("q")?.trim() ?? "");
      return;
    }

    setQuery("");
  }, [pathname, searchParams]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      router.push("/search");
      return;
    }

    router.push(`/search?q=${encodeURIComponent(trimmedQuery)}`);
  }

  return (
    <form className="app-chrome-search" role="search" onSubmit={handleSubmit}>
      <label className="sr-only" htmlFor={inputId}>
        {t("web.nav.headerSearchLabel")}
      </label>
      <input
        id={inputId}
        name="q"
        autoComplete="off"
        maxLength={200}
        placeholder={t("web.nav.headerSearchPlaceholder")}
        type="search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
        }}
      />
      <button type="submit" aria-label={t("common.search")}>
        {t("common.search")}
      </button>
    </form>
  );
}

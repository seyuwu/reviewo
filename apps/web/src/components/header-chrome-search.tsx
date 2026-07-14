"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef } from "react";

import { useTranslation } from "../features/i18n/locale-provider";
import { trackAnalyticsCta } from "../features/analytics/components/product-analytics-listener";
import { OpiniaIcon } from "./opinia-icon";

export function HeaderChromeSearch() {
  const t = useTranslation();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus({ preventScroll: true });
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    trackAnalyticsCta("header_search");
    const query = inputRef.current?.value.trim();

    if (query) {
      router.push(`/search?q=${encodeURIComponent(query)}`);
      return;
    }

    router.push("/search");
  }

  return (
    <form className="app-chrome-search" role="search" onSubmit={handleSubmit}>
      <label className="sr-only" htmlFor="app-chrome-search-input">
        {t("web.nav.headerSearchLabel")}
      </label>
      <OpiniaIcon className="app-chrome-search-icon" name="search" />
      <input
        ref={inputRef}
        id="app-chrome-search-input"
        autoComplete="off"
        maxLength={200}
        placeholder={t("web.nav.headerSearchPlaceholder")}
        type="search"
      />
      <kbd className="app-chrome-search-kbd" aria-hidden="true">
        Ctrl K
      </kbd>
    </form>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useId } from "react";

import { useTranslation } from "../../i18n/locale-provider";

export function CompactSearchBar() {
  const t = useTranslation();
  const inputId = useId();
  const router = useRouter();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const query = String(formData.get("q") ?? "").trim();

    if (!query) {
      router.push("/search");
      return;
    }

    router.push(`/search?q=${encodeURIComponent(query)}`);
  }

  return (
    <form className="discovery-compact-search" role="search" onSubmit={handleSubmit}>
      <label className="sr-only" htmlFor={inputId}>
        {t("web.homeFeed.compactSearchLabel")}
      </label>
      <input
        id={inputId}
        name="q"
        autoComplete="off"
        maxLength={200}
        placeholder={t("web.homeFeed.compactSearchPlaceholder")}
        type="search"
      />
      <button type="submit">{t("common.search")}</button>
    </form>
  );
}

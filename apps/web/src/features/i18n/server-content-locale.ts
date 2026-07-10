import { headers } from "next/headers";
import { resolveContentLocale, type EntityChatLocale } from "@reviewo/shared";

export async function resolveServerContentLocale(): Promise<EntityChatLocale> {
  const headerStore = await headers();
  const acceptLanguage = headerStore.get("accept-language") ?? "";
  const browserLanguages = acceptLanguage
    .split(",")
    .map((entry) => entry.trim().split(";")[0] ?? "")
    .filter(Boolean);

  return resolveContentLocale("auto", browserLanguages);
}

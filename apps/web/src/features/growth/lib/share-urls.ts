import { publicEnv } from "../../../lib/config/public-env";

export function buildEntityShareUrl(entityId: string): string {
  return new URL(`/entities/${entityId}`, publicEnv.siteUrl).toString();
}

export function buildEntityChatInviteUrl(entityId: string): string {
  const url = new URL(`/entities/${entityId}`, publicEnv.siteUrl);
  url.searchParams.set("chat", "open");

  return url.toString();
}

export function buildCompareShareUrl(pairSlug: string): string {
  return new URL(`/compare/${pairSlug}`, publicEnv.siteUrl).toString();
}

export function buildBattleShareUrl(pairSlug: string): string {
  return new URL(`/battle/${pairSlug}`, publicEnv.siteUrl).toString();
}

export function buildEntityOgImageUrl(entityId: string): string {
  return new URL(`/og/entity/${entityId}`, publicEnv.siteUrl).toString();
}

export function buildEntityEmbedUrl(entityId: string): string {
  return new URL(`/embed/entities/${entityId}`, publicEnv.siteUrl).toString();
}

export function buildEmbedCode(entityId: string): string {
  const src = buildEntityEmbedUrl(entityId);

  return `<iframe src="${src}" width="320" height="140" style="border:0;border-radius:16px;overflow:hidden" loading="lazy" title="Opinia rating"></iframe>`;
}

export function buildTelegramShareUrl(pageUrl: string, text: string): string {
  const params = new URLSearchParams({
    text,
    url: pageUrl
  });

  return `https://t.me/share/url?${params.toString()}`;
}

export function buildVkShareUrl(pageUrl: string): string {
  const params = new URLSearchParams({
    url: pageUrl
  });

  return `https://vk.com/share.php?${params.toString()}`;
}

export function buildXShareUrl(pageUrl: string, text: string): string {
  const params = new URLSearchParams({
    text,
    url: pageUrl
  });

  return `https://twitter.com/intent/tweet?${params.toString()}`;
}

export async function copyTextToClipboard(value: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      return fallbackCopyText(value);
    }
  }

  return fallbackCopyText(value);
}

function fallbackCopyText(value: string): boolean {
  if (typeof document === "undefined") {
    return false;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

export async function downloadImageFromUrl(url: string, filename: string): Promise<void> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Image download failed");
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}

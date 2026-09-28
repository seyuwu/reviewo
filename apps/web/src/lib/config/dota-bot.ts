export const DOTA_BOT_USERNAME = "FDPdotabot";

export type DotaBotAcquisitionSource = "seo" | "community";

export function buildDotaBotProfileUrl(): string {
  return `https://t.me/${DOTA_BOT_USERNAME}`;
}

export function buildDotaBotStartUrl(source: DotaBotAcquisitionSource): string {
  return `${buildDotaBotProfileUrl()}?start=src_${source}`;
}

import type { MetadataRoute } from "next";

import { publicEnv } from "../lib/config/public-env";
import { serverApiRequest } from "../lib/api/server-api-client";

export const revalidate = 3600;

const SITEMAP_PAGE_SIZE = 5000;
const MAX_ENTITY_PAGES = 100_000;

interface SitemapEntriesResponse {
  items: {
    id: string;
    updatedAt: string;
  }[];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = publicEnv.siteUrl.replace(/\/$/, "");
  const entries: MetadataRoute.Sitemap = [
    { changeFrequency: "daily", priority: 1, url: `${siteUrl}/` },
    { changeFrequency: "daily", priority: 0.9, url: `${siteUrl}/top` },
    { changeFrequency: "weekly", priority: 0.5, url: `${siteUrl}/privacy` }
  ];

  try {
    for (let offset = 0; offset < MAX_ENTITY_PAGES; offset += SITEMAP_PAGE_SIZE) {
      const response = await serverApiRequest<SitemapEntriesResponse>(
        `/entities/sitemap-entries?limit=${SITEMAP_PAGE_SIZE}&offset=${offset}`
      );

      for (const item of response.items) {
        entries.push({
          changeFrequency: "weekly",
          lastModified: new Date(item.updatedAt),
          priority: 0.8,
          url: `${siteUrl}/entities/${item.id}`
        });
      }

      if (response.items.length < SITEMAP_PAGE_SIZE) {
        break;
      }
    }
  } catch {
    // The API can be unreachable while the route prerenders (e.g. during image builds).
    // Ship the static entries; the hourly revalidation fills in entity URLs once it succeeds.
  }

  return entries;
}

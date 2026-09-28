import type { MetadataRoute } from "next";

import { getDotaPublicOrigin } from "../lib/config/product-hosts";
import { publicEnv } from "../lib/config/public-env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        disallow: [
          "/admin",
          "/api",
          "/contribute",
          "/embed",
          "/j",
          "/og",
          "/profile",
          "/ratings",
          "/recover",
          "/search",
          "/spotlight"
        ]
      }
    ],
    sitemap: [
      new URL("/sitemap.xml", publicEnv.siteUrl).toString(),
      `${getDotaPublicOrigin()}/sitemap-dota.xml`
    ]
  };
}

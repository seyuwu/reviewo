import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SiteMetadataFetcherService } from "./site-metadata-fetcher.service.js";

describe("SiteMetadataFetcherService", () => {
  const service = new SiteMetadataFetcherService();

  it("extracts og:image and favicon from HTML", async () => {
    const html = `
      <html>
        <head>
          <meta property="og:image" content="https://cdn.example.com/share.png" />
          <link rel="icon" href="/favicon.ico" />
        </head>
      </html>
    `;

    const metadata = await service.fetchMetadata("https://example.com/page", {
      fetchImpl: async () =>
        new Response(html, {
          headers: {
            "content-type": "text/html"
          },
          status: 200
        })
    });

    assert.equal(metadata.ogImageUrl, "https://cdn.example.com/share.png");
    assert.equal(metadata.faviconUrl, "https://example.com/favicon.ico");
  });

  it("resolves relative og:image URLs against the final page URL", async () => {
    const html = `<meta property="og:image" content="/assets/logo.png" />`;

    const metadata = await service.fetchMetadata("https://example.com/blog/post", {
      fetchImpl: async () =>
        new Response(html, {
          status: 200
        })
    });

    assert.equal(metadata.ogImageUrl, "https://example.com/assets/logo.png");
  });

  it("falls back to /favicon.ico when no icon link is present", async () => {
    const metadata = await service.fetchMetadata("https://example.com/", {
      fetchImpl: async () =>
        new Response("<html><head></head></html>", {
          status: 200
        })
    });

    assert.equal(metadata.faviconUrl, "https://example.com/favicon.ico");
    assert.equal(metadata.ogImageUrl, null);
  });
});

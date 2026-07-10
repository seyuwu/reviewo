import { serverApiRequest } from "../../../lib/api/server-api-client";
import { appendContentLocaleToPath } from "../../i18n/content-locale";
import type { ContentLocaleParam } from "../../i18n/content-locale";
import type { SpotlightFeedResponse } from "../types/spotlight";

export async function fetchSpotlightFeedServer(
  limit = 30,
  locale?: ContentLocaleParam
): Promise<SpotlightFeedResponse | null> {
  try {
    const path = locale
      ? appendContentLocaleToPath(`/spotlight?limit=${limit}`, locale)
      : `/spotlight?limit=${limit}`;

    return await serverApiRequest<SpotlightFeedResponse>(path);
  } catch {
    return null;
  }
}

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export interface TelegramLoginPayload {
  auth_date: string;
  first_name: string;
  hash: string;
  id: string;
  last_name?: string;
  photo_url?: string;
  username?: string;
}

const MAX_AUTH_AGE_SECONDS = 5 * 60;
const MAX_FUTURE_SKEW_SECONDS = 30;

export function verifyTelegramLoginPayload(
  payload: TelegramLoginPayload,
  botToken: string,
  nowSeconds = Math.floor(Date.now() / 1000)
): boolean {
  const authDate = Number(payload.auth_date);
  if (
    !Number.isSafeInteger(authDate) ||
    authDate > nowSeconds + MAX_FUTURE_SKEW_SECONDS ||
    nowSeconds - authDate > MAX_AUTH_AGE_SECONDS
  ) {
    return false;
  }

  const fields = Object.entries(payload)
    .filter(([key]) => key !== "hash")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = createHash("sha256").update(botToken).digest();
  const expected = createHmac("sha256", secretKey).update(fields).digest();

  let provided: Buffer;
  try {
    provided = Buffer.from(payload.hash, "hex");
  } catch {
    return false;
  }

  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

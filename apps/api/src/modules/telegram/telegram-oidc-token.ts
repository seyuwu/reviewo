import { createPublicKey, verify } from "node:crypto";

export type TelegramOidcKey = {
  kid?: string;
  use?: string;
  alg?: string;
  kty?: string;
  n?: string;
  e?: string;
};
export type TelegramOidcIdentity = { id: string; username: string | null };

export function verifyTelegramOidcToken(
  token: string,
  request: { clientId: string; nonce: string; createdAt: number },
  keys: TelegramOidcKey[],
  now = Math.floor(Date.now() / 1000)
): TelegramOidcIdentity {
  if (token.length > 16384 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))
    throw new Error("Invalid Telegram token");
  const [headerPart, payloadPart, signaturePart] = token.split(".") as [string, string, string];
  const header = JSON.parse(Buffer.from(headerPart, "base64url").toString("utf8")) as Record<
    string,
    unknown
  >;
  if (
    !header ||
    header.alg !== "RS256" ||
    typeof header.kid !== "string" ||
    header.kid.length > 128 ||
    header.crit !== undefined
  )
    throw new Error("Invalid Telegram signing algorithm");
  const jwk = keys.find(
    (key) =>
      key.kid === header.kid &&
      key.kty === "RSA" &&
      (!key.use || key.use === "sig") &&
      (!key.alg || key.alg === "RS256")
  );
  if (!jwk?.n || !jwk.e || Buffer.from(jwk.n, "base64url").length < 256)
    throw new Error("Unknown Telegram signing key");
  const publicKey = createPublicKey({ key: { kty: "RSA", n: jwk.n, e: jwk.e }, format: "jwk" });
  if (
    !verify(
      "RSA-SHA256",
      Buffer.from(`${headerPart}.${payloadPart}`),
      publicKey,
      Buffer.from(signaturePart, "base64url")
    )
  )
    throw new Error("Invalid Telegram signature");

  const claims = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")) as Record<
    string,
    unknown
  >;
  if (
    !claims ||
    claims.iss !== "https://oauth.telegram.org" ||
    claims.aud !== request.clientId ||
    claims.nonce !== request.nonce ||
    typeof claims.sub !== "string" ||
    !claims.sub ||
    !Number.isSafeInteger(claims.iat) ||
    !Number.isSafeInteger(claims.exp) ||
    (claims.iat as number) < request.createdAt - 30 ||
    (claims.iat as number) > now + 30 ||
    (claims.exp as number) <= now ||
    (claims.exp as number) <= (claims.iat as number) ||
    (claims.nbf !== undefined &&
      (!Number.isSafeInteger(claims.nbf) || (claims.nbf as number) > now + 30))
  )
    throw new Error("Invalid or expired Telegram claims");

  // `sub` is an OIDC subject, not the numerical user ID accepted by the Bot API.
  const id =
    typeof claims.id === "number" && Number.isSafeInteger(claims.id)
      ? String(claims.id)
      : typeof claims.id === "string"
        ? claims.id
        : "";
  if (!/^[1-9]\d{0,19}$/.test(id)) throw new Error("Missing Telegram user ID");
  const username =
    typeof claims.preferred_username === "string" &&
    /^[A-Za-z0-9_]{1,32}$/.test(claims.preferred_username)
      ? claims.preferred_username
      : null;
  return { id, username };
}

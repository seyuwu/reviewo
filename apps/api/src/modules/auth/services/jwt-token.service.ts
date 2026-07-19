import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, timingSafeEqual } from "node:crypto";

import type { EnvironmentVariables } from "../../../config/environment.validation.js";

interface JwtHeader {
  alg: "HS256";
  typ: "JWT";
}

interface JwtAccessTokenPayload {
  exp: number;
  iat: number;
  sub: string;
}

interface FriendInviteTokenPayload {
  exp: number;
  iat: number;
  purpose: "friend_invite";
  sub: string;
}

interface PartyJoinTokenPayload {
  exp: number;
  iat: number;
  purpose: "party_join";
  slug: string;
  sub: string;
}

interface DiscordLinkTokenPayload {
  exp: number;
  iat: number;
  purpose: "discord_link";
  returnOrigin: string;
  returnTo: string;
  sub: string;
}

export interface VerifiedAccessToken {
  userId: string;
}

export interface VerifiedFriendInviteToken {
  inviterUserId: string;
}

export interface VerifiedPartyJoinToken {
  partyId: string;
  slug: string;
}

export interface VerifiedDiscordLinkToken {
  returnOrigin: string;
  returnTo: string;
  userId: string;
}

/** Friend-invite share links remain valid for 30 days. */
const FRIEND_INVITE_TTL_SECONDS = 60 * 60 * 24 * 30;

/** Party auto-join share links remain valid for 7 days. */
const PARTY_JOIN_TTL_SECONDS = 60 * 60 * 24 * 7;

/** Discord OAuth CSRF state TTL. */
const DISCORD_LINK_TTL_SECONDS = 60 * 10;

@Injectable()
export class JwtTokenService {
  constructor(private readonly configService: ConfigService<EnvironmentVariables, true>) {}

  signAccessToken(userId: string): string {
    const nowSeconds = getCurrentUnixSeconds();
    const ttlSeconds = this.configService.get("JWT_ACCESS_TOKEN_TTL_SECONDS", { infer: true });
    const header: JwtHeader = {
      alg: "HS256",
      typ: "JWT"
    };
    const payload: JwtAccessTokenPayload = {
      exp: nowSeconds + ttlSeconds,
      iat: nowSeconds,
      sub: userId
    };
    const encodedHeader = encodeJson(header);
    const encodedPayload = encodeJson(payload);
    const signature = this.sign(`${encodedHeader}.${encodedPayload}`);

    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  signFriendInviteToken(inviterUserId: string): string {
    const nowSeconds = getCurrentUnixSeconds();
    const header: JwtHeader = {
      alg: "HS256",
      typ: "JWT"
    };
    const payload: FriendInviteTokenPayload = {
      exp: nowSeconds + FRIEND_INVITE_TTL_SECONDS,
      iat: nowSeconds,
      purpose: "friend_invite",
      sub: inviterUserId
    };
    const encodedHeader = encodeJson(header);
    const encodedPayload = encodeJson(payload);
    const signature = this.sign(`${encodedHeader}.${encodedPayload}`);

    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  signPartyJoinToken(partyId: string, slug: string): string {
    const nowSeconds = getCurrentUnixSeconds();
    const header: JwtHeader = {
      alg: "HS256",
      typ: "JWT"
    };
    const payload: PartyJoinTokenPayload = {
      exp: nowSeconds + PARTY_JOIN_TTL_SECONDS,
      iat: nowSeconds,
      purpose: "party_join",
      slug,
      sub: partyId
    };
    const encodedHeader = encodeJson(header);
    const encodedPayload = encodeJson(payload);
    const signature = this.sign(`${encodedHeader}.${encodedPayload}`);

    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  signDiscordLinkState(userId: string, returnTo: string, returnOrigin: string): string {
    const nowSeconds = getCurrentUnixSeconds();
    const header: JwtHeader = {
      alg: "HS256",
      typ: "JWT"
    };
    const payload: DiscordLinkTokenPayload = {
      exp: nowSeconds + DISCORD_LINK_TTL_SECONDS,
      iat: nowSeconds,
      purpose: "discord_link",
      returnOrigin,
      returnTo,
      sub: userId
    };
    const encodedHeader = encodeJson(header);
    const encodedPayload = encodeJson(payload);
    const signature = this.sign(`${encodedHeader}.${encodedPayload}`);

    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  verifyAccessToken(token: string): VerifiedAccessToken | null {
    const parts = token.split(".");

    if (parts.length !== 3) {
      return null;
    }

    const [encodedHeader, encodedPayload, encodedSignature] = parts;

    if (!encodedHeader || !encodedPayload || !encodedSignature) {
      return null;
    }

    const expectedSignature = this.sign(`${encodedHeader}.${encodedPayload}`);

    if (!safeEqual(encodedSignature, expectedSignature)) {
      return null;
    }

    const header = decodeJson(encodedHeader);
    const payload = decodeJson(encodedPayload);

    if (!isJwtHeader(header) || !isJwtAccessTokenPayload(payload)) {
      return null;
    }

    // Access tokens must not carry an invite purpose claim.
    if (
      typeof payload === "object" &&
      payload !== null &&
      "purpose" in payload &&
      (payload as { purpose?: unknown }).purpose !== undefined
    ) {
      return null;
    }

    if (payload.exp <= getCurrentUnixSeconds()) {
      return null;
    }

    return {
      userId: payload.sub
    };
  }

  verifyFriendInviteToken(token: string): VerifiedFriendInviteToken | null {
    const parts = token.split(".");

    if (parts.length !== 3) {
      return null;
    }

    const [encodedHeader, encodedPayload, encodedSignature] = parts;

    if (!encodedHeader || !encodedPayload || !encodedSignature) {
      return null;
    }

    const expectedSignature = this.sign(`${encodedHeader}.${encodedPayload}`);

    if (!safeEqual(encodedSignature, expectedSignature)) {
      return null;
    }

    const header = decodeJson(encodedHeader);
    const payload = decodeJson(encodedPayload);

    if (!isJwtHeader(header) || !isFriendInviteTokenPayload(payload)) {
      return null;
    }

    if (payload.exp <= getCurrentUnixSeconds()) {
      return null;
    }

    return {
      inviterUserId: payload.sub
    };
  }

  verifyPartyJoinToken(token: string): VerifiedPartyJoinToken | null {
    const parts = token.split(".");

    if (parts.length !== 3) {
      return null;
    }

    const [encodedHeader, encodedPayload, encodedSignature] = parts;

    if (!encodedHeader || !encodedPayload || !encodedSignature) {
      return null;
    }

    const expectedSignature = this.sign(`${encodedHeader}.${encodedPayload}`);

    if (!safeEqual(encodedSignature, expectedSignature)) {
      return null;
    }

    const header = decodeJson(encodedHeader);
    const payload = decodeJson(encodedPayload);

    if (!isJwtHeader(header) || !isPartyJoinTokenPayload(payload)) {
      return null;
    }

    if (payload.exp <= getCurrentUnixSeconds()) {
      return null;
    }

    return {
      partyId: payload.sub,
      slug: payload.slug
    };
  }

  verifyDiscordLinkState(token: string): VerifiedDiscordLinkToken | null {
    const parts = token.split(".");

    if (parts.length !== 3) {
      return null;
    }

    const [encodedHeader, encodedPayload, encodedSignature] = parts;

    if (!encodedHeader || !encodedPayload || !encodedSignature) {
      return null;
    }

    const expectedSignature = this.sign(`${encodedHeader}.${encodedPayload}`);

    if (!safeEqual(encodedSignature, expectedSignature)) {
      return null;
    }

    const header = decodeJson(encodedHeader);
    const payload = decodeJson(encodedPayload);

    if (!isJwtHeader(header) || !isDiscordLinkTokenPayload(payload)) {
      return null;
    }

    if (payload.exp <= getCurrentUnixSeconds()) {
      return null;
    }

    return {
      returnOrigin: payload.returnOrigin,
      returnTo: payload.returnTo,
      userId: payload.sub
    };
  }

  private sign(value: string): string {
    const secret = this.configService.get("JWT_SECRET", { infer: true });

    return createHmac("sha256", secret).update(value).digest("base64url");
  }
}

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeJson(value: string): unknown {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
  } catch {
    return null;
  }
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function isJwtHeader(value: unknown): value is JwtHeader {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Partial<JwtHeader>).alg === "HS256" &&
    (value as Partial<JwtHeader>).typ === "JWT"
  );
}

function isJwtAccessTokenPayload(value: unknown): value is JwtAccessTokenPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<JwtAccessTokenPayload> & { purpose?: unknown };

  return (
    typeof candidate.exp === "number" &&
    typeof candidate.iat === "number" &&
    typeof candidate.sub === "string" &&
    candidate.sub.length > 0 &&
    candidate.purpose === undefined
  );
}

function isFriendInviteTokenPayload(value: unknown): value is FriendInviteTokenPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<FriendInviteTokenPayload>;

  return (
    candidate.purpose === "friend_invite" &&
    typeof candidate.exp === "number" &&
    typeof candidate.iat === "number" &&
    typeof candidate.sub === "string" &&
    candidate.sub.length > 0
  );
}

function isPartyJoinTokenPayload(value: unknown): value is PartyJoinTokenPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<PartyJoinTokenPayload>;

  return (
    candidate.purpose === "party_join" &&
    typeof candidate.exp === "number" &&
    typeof candidate.iat === "number" &&
    typeof candidate.sub === "string" &&
    candidate.sub.length > 0 &&
    typeof candidate.slug === "string" &&
    candidate.slug.length > 0
  );
}

function isDiscordLinkTokenPayload(value: unknown): value is DiscordLinkTokenPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<DiscordLinkTokenPayload>;

  return (
    candidate.purpose === "discord_link" &&
    typeof candidate.exp === "number" &&
    typeof candidate.iat === "number" &&
    typeof candidate.sub === "string" &&
    candidate.sub.length > 0 &&
    typeof candidate.returnTo === "string" &&
    candidate.returnTo.startsWith("/") &&
    !candidate.returnTo.startsWith("//") &&
    typeof candidate.returnOrigin === "string" &&
    isAllowedHttpOrigin(candidate.returnOrigin)
  );
}

function isAllowedHttpOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.origin === value;
  } catch {
    return false;
  }
}

function getCurrentUnixSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

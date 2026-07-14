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

export interface VerifiedAccessToken {
  userId: string;
}

export interface VerifiedFriendInviteToken {
  inviterUserId: string;
}

/** Friend-invite share links remain valid for 30 days. */
const FRIEND_INVITE_TTL_SECONDS = 60 * 60 * 24 * 30;

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

function getCurrentUnixSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

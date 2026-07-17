import { Injectable, Logger } from "@nestjs/common";
import { createSign, randomUUID } from "node:crypto";

import {
  GAMES_LAUNCH_SHEET_INTEREST,
  GAMES_LAUNCH_SHEET_SUGGESTIONS
} from "../games-launch.constants.js";

interface SheetsConfig {
  clientEmail: string;
  privateKey: string;
  spreadsheetId: string;
}

interface InterestRow {
  id: string;
  channel: string;
  contact: string;
  userId: string | null;
  createdAt: Date;
}

interface SuggestionRow {
  id: string;
  source: string;
  body: string;
  contact: string | null;
  userId: string | null;
  createdAt: Date;
}

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const TOKEN_SKEW_MS = 60_000;

@Injectable()
export class GamesLaunchSheetsService {
  private readonly logger = new Logger(GamesLaunchSheetsService.name);
  private cachedToken: { accessToken: string; expiresAtMs: number } | null = null;
  private headersEnsured = new Set<string>();

  isConfigured(): boolean {
    return this.readConfig() !== null;
  }

  async appendInterest(row: InterestRow): Promise<void> {
    await this.appendRow(GAMES_LAUNCH_SHEET_INTEREST, [
      row.createdAt.toISOString(),
      row.channel,
      row.contact,
      row.userId ?? "",
      row.id
    ], ["createdAt", "channel", "contact", "userId", "id"]);
  }

  async appendSuggestion(row: SuggestionRow): Promise<void> {
    await this.appendRow(GAMES_LAUNCH_SHEET_SUGGESTIONS, [
      row.createdAt.toISOString(),
      row.source,
      row.body,
      row.contact ?? "",
      row.userId ?? "",
      row.id
    ], ["createdAt", "source", "body", "contact", "userId", "id"]);
  }

  private async appendRow(
    sheetName: string,
    values: string[],
    headers: string[]
  ): Promise<void> {
    const config = this.readConfig();

    if (!config) {
      return;
    }

    try {
      await this.ensureHeaders(config, sheetName, headers);
      const accessToken = await this.getAccessToken(config);
      const range = encodeURIComponent(`${sheetName}!A:Z`);
      const url =
        `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}` +
        `/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

      const response = await fetch(url, {
        body: JSON.stringify({ values: [values] }),
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        method: "POST"
      });

      if (!response.ok) {
        const body = await response.text();
        this.logger.warn(
          `Google Sheets append failed (${sheetName}): ${response.status} ${body.slice(0, 300)}`
        );
      }
    } catch (error) {
      this.logger.warn(
        `Google Sheets append error (${sheetName}): ${
          error instanceof Error ? error.message : "unknown"
        }`
      );
    }
  }

  private async ensureHeaders(
    config: SheetsConfig,
    sheetName: string,
    headers: string[]
  ): Promise<void> {
    if (this.headersEnsured.has(sheetName)) {
      return;
    }

    const accessToken = await this.getAccessToken(config);
    const range = encodeURIComponent(`${sheetName}!A1:Z1`);
    const url =
      `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}/values/${range}`;

    const existing = await fetch(url, {
      headers: { authorization: `Bearer ${accessToken}` },
      method: "GET"
    });

    if (!existing.ok) {
      const body = await existing.text();
      this.logger.warn(
        `Google Sheets header check failed (${sheetName}): ${existing.status} ${body.slice(0, 300)}`
      );
      return;
    }

    const payload = (await existing.json()) as { values?: string[][] };
    const hasHeader = Boolean(payload.values?.[0]?.some((cell) => cell.trim().length > 0));

    if (!hasHeader) {
      const writeUrl =
        `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}` +
        `/values/${range}?valueInputOption=USER_ENTERED`;
      const write = await fetch(writeUrl, {
        body: JSON.stringify({ values: [headers] }),
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        method: "PUT"
      });

      if (!write.ok) {
        const body = await write.text();
        this.logger.warn(
          `Google Sheets header write failed (${sheetName}): ${write.status} ${body.slice(0, 300)}`
        );
        return;
      }
    }

    this.headersEnsured.add(sheetName);
  }

  private async getAccessToken(config: SheetsConfig): Promise<string> {
    const now = Date.now();

    if (this.cachedToken && this.cachedToken.expiresAtMs > now + TOKEN_SKEW_MS) {
      return this.cachedToken.accessToken;
    }

    const assertion = createGoogleJwtAssertion(config);
    const response = await fetch(TOKEN_URL, {
      body: new URLSearchParams({
        assertion,
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer"
      }),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      method: "POST"
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`token exchange failed: ${response.status} ${body.slice(0, 200)}`);
    }

    const payload = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
    };

    if (!payload.access_token) {
      throw new Error("token exchange returned no access_token");
    }

    const expiresInSec = payload.expires_in ?? 3600;
    this.cachedToken = {
      accessToken: payload.access_token,
      expiresAtMs: now + expiresInSec * 1000
    };

    return payload.access_token;
  }

  private readConfig(): SheetsConfig | null {
    const clientEmail = process.env["GOOGLE_SHEETS_CLIENT_EMAIL"]?.trim() ?? "";
    const spreadsheetId = process.env["GAMES_LAUNCH_SHEET_ID"]?.trim() ?? "";
    const privateKeyRaw = process.env["GOOGLE_SHEETS_PRIVATE_KEY"] ?? "";
    const privateKey = normalizePrivateKey(privateKeyRaw);

    if (!clientEmail || !spreadsheetId || !privateKey) {
      return null;
    }

    return { clientEmail, privateKey, spreadsheetId };
  }
}

function normalizePrivateKey(value: string): string {
  const trimmed = value.trim().replace(/^"|"$/g, "").replace(/\\n/g, "\n");

  if (!trimmed) {
    return "";
  }

  if (trimmed.includes("BEGIN")) {
    return trimmed.endsWith("\n") ? trimmed : `${trimmed}\n`;
  }

  return `-----BEGIN PRIVATE KEY-----\n${trimmed}\n-----END PRIVATE KEY-----\n`;
}

function createGoogleJwtAssertion(config: SheetsConfig): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = base64UrlJson({ alg: "RS256", typ: "JWT" });
  const claimSet = base64UrlJson({
    aud: TOKEN_URL,
    exp: nowSec + 3600,
    iat: nowSec,
    iss: config.clientEmail,
    jti: randomUUID(),
    scope: SHEETS_SCOPE
  });
  const unsigned = `${header}.${claimSet}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(config.privateKey).toString("base64url");
  return `${unsigned}.${signature}`;
}

function base64UrlJson(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

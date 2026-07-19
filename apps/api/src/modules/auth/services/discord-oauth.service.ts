import { Injectable, Logger } from "@nestjs/common";

const DISCORD_API = "https://discord.com/api/v10";
const DISCORD_AUTHORIZE = "https://discord.com/api/oauth2/authorize";
const DISCORD_TOKEN = "https://discord.com/api/oauth2/token";

export interface DiscordOAuthUser {
  id: string;
  username: string;
}

@Injectable()
export class DiscordOauthService {
  private readonly logger = new Logger(DiscordOauthService.name);

  isConfigured(): boolean {
    return Boolean(this.clientId() && this.clientSecret() && this.redirectUri());
  }

  buildAuthorizeUrl(state: string): string {
    const clientId = this.requireClientId();
    const redirectUri = this.requireRedirectUri();
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "identify",
      state
    });

    return `${DISCORD_AUTHORIZE}?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<DiscordOAuthUser> {
    const clientId = this.requireClientId();
    const clientSecret = this.requireClientSecret();
    const redirectUri = this.requireRedirectUri();

    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri
    });

    const tokenResponse = await fetch(DISCORD_TOKEN, {
      body,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      method: "POST"
    });

    const tokenText = await tokenResponse.text();
    let tokenPayload: unknown = null;

    if (tokenText) {
      try {
        tokenPayload = JSON.parse(tokenText) as unknown;
      } catch {
        tokenPayload = tokenText;
      }
    }

    if (!tokenResponse.ok) {
      this.logger.warn(`Discord token exchange failed (${tokenResponse.status}): ${tokenText.slice(0, 200)}`);
      throw new Error("Discord token exchange failed");
    }

    const accessToken =
      typeof tokenPayload === "object" &&
      tokenPayload &&
      "access_token" in tokenPayload &&
      typeof (tokenPayload as { access_token: unknown }).access_token === "string"
        ? (tokenPayload as { access_token: string }).access_token
        : null;

    if (!accessToken) {
      throw new Error("Discord token exchange returned no access_token");
    }

    const meResponse = await fetch(`${DISCORD_API}/users/@me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    const meText = await meResponse.text();
    let mePayload: unknown = null;

    if (meText) {
      try {
        mePayload = JSON.parse(meText) as unknown;
      } catch {
        mePayload = meText;
      }
    }

    if (!meResponse.ok) {
      this.logger.warn(`Discord @me failed (${meResponse.status}): ${meText.slice(0, 200)}`);
      throw new Error("Discord profile fetch failed");
    }

    if (
      typeof mePayload !== "object" ||
      !mePayload ||
      typeof (mePayload as { id?: unknown }).id !== "string"
    ) {
      throw new Error("Discord profile missing id");
    }

    const id = (mePayload as { id: string }).id;
    const username =
      typeof (mePayload as { username?: unknown }).username === "string"
        ? (mePayload as { username: string }).username
        : id;

    return { id, username };
  }

  private clientId(): string | undefined {
    return trimEnv(process.env["DISCORD_OAUTH_CLIENT_ID"] ?? process.env["DISCORD_CLIENT_ID"]);
  }

  private clientSecret(): string | undefined {
    return trimEnv(process.env["DISCORD_OAUTH_CLIENT_SECRET"] ?? process.env["DISCORD_CLIENT_SECRET"]);
  }

  private redirectUri(): string | undefined {
    return trimEnv(process.env["DISCORD_OAUTH_REDIRECT_URI"]);
  }

  private requireClientId(): string {
    const value = this.clientId();
    if (!value) {
      throw new Error("DISCORD_OAUTH_CLIENT_ID is not configured");
    }
    return value;
  }

  private requireClientSecret(): string {
    const value = this.clientSecret();
    if (!value) {
      throw new Error("DISCORD_OAUTH_CLIENT_SECRET is not configured");
    }
    return value;
  }

  private requireRedirectUri(): string {
    const value = this.redirectUri();
    if (!value) {
      throw new Error("DISCORD_OAUTH_REDIRECT_URI is not configured");
    }
    return value;
  }
}

function trimEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

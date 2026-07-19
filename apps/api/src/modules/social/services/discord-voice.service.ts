import { Injectable, Logger } from "@nestjs/common";

const DISCORD_API = "https://discord.com/api/v10";
const CHANNEL_TYPE_GUILD_VOICE = 2;
const OVERWRITE_ROLE = 0;
const OVERWRITE_MEMBER = 1;

/** One-shot join invite TTL (seconds). */
export const DISCORD_JOIN_INVITE_MAX_AGE_SECONDS = 300;

/** Permission bits: https://discord.com/developers/docs/topics/permissions */
const PERM_VIEW_CHANNEL = 1n << 10n;
const PERM_CONNECT = 1n << 20n;
const PERM_SPEAK = 1n << 21n;

export interface DiscordPartyVoiceResult {
  channelId: string;
  inviteUrl: string;
}

export interface DiscordCreateInviteOptions {
  maxAgeSeconds: number;
  /** 0 = unlimited. Use 1 for one-shot join links. */
  maxUses?: number;
  token?: string;
}

@Injectable()
export class DiscordVoiceService {
  private readonly logger = new Logger(DiscordVoiceService.name);

  isConfigured(): boolean {
    return Boolean(this.botToken() && this.guildId() && this.categoryId());
  }

  async createPartyVoice(input: {
    maxAgeSeconds: number;
    name: string;
  }): Promise<DiscordPartyVoiceResult> {
    const token = this.requireBotToken();
    const guildId = this.requireGuildId();
    const categoryId = this.requireCategoryId();
    const channelName = sanitizeDiscordChannelName(input.name);

    // Create without permission_overwrites first — Discord returns 403 Missing Permissions
    // when overwrites are included in the create payload for this bot/guild setup.
    const channel = await this.request<{ id: string }>("POST", `/guilds/${guildId}/channels`, token, {
      name: channelName,
      parent_id: categoryId,
      type: CHANNEL_TYPE_GUILD_VOICE,
      // 0 = unlimited — friends can hop into Discord voice beyond party size.
      user_limit: 0
    });

    try {
      // ACL is best-effort: @everyone VIEW, deny CONNECT. Needs Manage Channels.
      // Never roll back a successful channel create just because overwrites fail.
      try {
        await this.applyEveryoneVoiceAcl(channel.id, guildId, token);
      } catch (aclError) {
        this.logger.warn(
          `Skipped Discord voice ACL for ${channel.id}: ${
            aclError instanceof Error ? aclError.message : "unknown"
          }. Raise bot role above @everyone with Manage Channels.`
        );
      }

      const inviteUrl = await this.createInvite(channel.id, {
        maxAgeSeconds: input.maxAgeSeconds,
        maxUses: 0,
        token
      });
      return { channelId: channel.id, inviteUrl };
    } catch (error) {
      await this.deleteChannel(channel.id).catch(() => undefined);
      throw error;
    }
  }

  async createInvite(channelId: string, options: DiscordCreateInviteOptions): Promise<string> {
    const token = options.token ?? this.requireBotToken();
    const maxUses = Math.max(0, Math.min(100, Math.floor(options.maxUses ?? 0)));

    const invite = await this.request<{ code: string }>(
      "POST",
      `/channels/${channelId}/invites`,
      token,
      {
        max_age: Math.max(60, Math.min(604_800, Math.floor(options.maxAgeSeconds))),
        max_uses: maxUses,
        unique: true
      }
    );

    return `https://discord.gg/${invite.code}`;
  }

  async createJoinInvite(channelId: string): Promise<string> {
    return this.createInvite(channelId, {
      maxAgeSeconds: DISCORD_JOIN_INVITE_MAX_AGE_SECONDS,
      maxUses: 1
    });
  }

  /**
   * Best-effort voice ACL: @everyone can VIEW, cannot CONNECT/SPEAK.
   * Join requires per-member grantMemberVoiceAccess. Needs bot Manage Channels.
   */
  async ensureVoiceChannelAcl(channelId: string): Promise<void> {
    const token = this.requireBotToken();
    const guildId = this.requireGuildId();
    await this.applyEveryoneVoiceAcl(channelId, guildId, token);

    // Clear seat cap on existing party channels (was tied to maxMembers).
    await this.request("PATCH", `/channels/${channelId}`, token, {
      user_limit: 0
    });
  }

  /** Grant one Discord user CONNECT on the party voice channel. */
  async grantMemberVoiceAccess(channelId: string, discordUserId: string): Promise<void> {
    const token = this.requireBotToken();

    await this.request("PUT", `/channels/${channelId}/permissions/${discordUserId}`, token, {
      allow: (PERM_VIEW_CHANNEL | PERM_CONNECT | PERM_SPEAK).toString(),
      deny: "0",
      type: OVERWRITE_MEMBER
    });
  }

  /** Remove per-member CONNECT after leave/kick. */
  async revokeMemberVoiceAccess(channelId: string, discordUserId: string): Promise<void> {
    const token = this.requireBotToken();

    try {
      await this.request("DELETE", `/channels/${channelId}/permissions/${discordUserId}`, token);
    } catch (error) {
      this.logger.warn(
        `Failed to revoke Discord voice access for ${discordUserId} on ${channelId}: ${
          error instanceof Error ? error.message : "unknown"
        }`
      );
    }
  }

  /**
   * Move member into party voice if they are already connected to voice on this guild.
   * Discord API cannot pull users who are idle / on another server.
   */
  async tryMoveMemberToVoice(channelId: string, discordUserId: string): Promise<boolean> {
    const token = this.requireBotToken();
    const guildId = this.requireGuildId();

    try {
      await this.request("PATCH", `/guilds/${guildId}/members/${discordUserId}`, token, {
        channel_id: channelId
      });
      return true;
    } catch (error) {
      this.logger.debug(
        `Could not auto-move Discord user ${discordUserId} to ${channelId}: ${
          error instanceof Error ? error.message : "unknown"
        }`
      );
      return false;
    }
  }

  getGuildId(): string {
    return this.requireGuildId();
  }

  async deleteChannel(channelId: string): Promise<boolean> {
    if (!this.isConfigured() || !channelId) {
      return true;
    }

    try {
      await this.request("DELETE", `/channels/${channelId}`, this.requireBotToken());
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      // Already gone — treat as cleaned.
      if (/\(404\)/.test(message)) {
        return true;
      }

      this.logger.warn(`Failed to delete Discord channel ${channelId}: ${message}`);
      return false;
    }
  }

  /**
   * True if any of the Discord users is currently connected to this voice channel.
   * Fail-safe: inconclusive API errors → treat as occupied (do not delete mid-call).
   */
  async isVoiceChannelOccupied(
    channelId: string,
    discordUserIds: string[]
  ): Promise<boolean> {
    if (!channelId || discordUserIds.length === 0 || !this.isConfigured()) {
      return false;
    }

    const results = await Promise.all(
      discordUserIds.map((discordUserId) => this.readMemberVoiceChannelId(discordUserId))
    );

    if (results.some((result) => result.channelId === channelId)) {
      return true;
    }

    if (results.some((result) => result.inconclusive)) {
      this.logger.warn(
        `Discord voice occupancy check inconclusive for ${channelId}; treating as occupied`
      );
      return true;
    }

    return false;
  }

  private async readMemberVoiceChannelId(
    discordUserId: string
  ): Promise<{ channelId: string | null; inconclusive: boolean }> {
    const token = this.requireBotToken();
    const guildId = this.requireGuildId();

    try {
      const state = await this.request<{ channel_id: string | null }>(
        "GET",
        `/guilds/${guildId}/voice-states/${discordUserId}`,
        token
      );
      return { channelId: state.channel_id ?? null, inconclusive: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";

      if (/\(404\)/.test(message)) {
        return { channelId: null, inconclusive: false };
      }

      this.logger.warn(
        `Failed to read Discord voice state for ${discordUserId}: ${message}`
      );
      return { channelId: null, inconclusive: true };
    }
  }

  private botToken(): string | undefined {
    return trimEnv(process.env["DISCORD_BOT_TOKEN"]);
  }

  private guildId(): string | undefined {
    return trimEnv(process.env["DISCORD_GUILD_ID"]);
  }

  private categoryId(): string | undefined {
    return trimEnv(process.env["DISCORD_PARTY_CATEGORY_ID"]);
  }

  private requireBotToken(): string {
    const token = this.botToken();
    if (!token) {
      throw new Error("DISCORD_BOT_TOKEN is not configured");
    }
    return token;
  }

  private requireGuildId(): string {
    const id = this.guildId();
    if (!id) {
      throw new Error("DISCORD_GUILD_ID is not configured");
    }
    return id;
  }

  private requireCategoryId(): string {
    const id = this.categoryId();
    if (!id) {
      throw new Error("DISCORD_PARTY_CATEGORY_ID is not configured");
    }
    return id;
  }

  /** @everyone can see the channel; CONNECT/SPEAK only via member overwrites. */
  private everyoneVoiceOverwrite(guildId: string): {
    allow: string;
    deny: string;
    id: string;
    type: number;
  } {
    return {
      // @everyone role id == guild id
      allow: PERM_VIEW_CHANNEL.toString(),
      deny: (PERM_CONNECT | PERM_SPEAK).toString(),
      id: guildId,
      type: OVERWRITE_ROLE
    };
  }

  private async applyEveryoneVoiceAcl(
    channelId: string,
    guildId: string,
    token: string
  ): Promise<void> {
    const overwrite = this.everyoneVoiceOverwrite(guildId);
    await this.request("PUT", `/channels/${channelId}/permissions/${guildId}`, token, {
      allow: overwrite.allow,
      deny: overwrite.deny,
      type: OVERWRITE_ROLE
    });
  }

  private async request<T = unknown>(
    method: string,
    path: string,
    token: string,
    body?: Record<string, unknown>
  ): Promise<T> {
    const init: RequestInit = {
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json"
      },
      method
    };

    if (body) {
      init.body = JSON.stringify(body);
    }

    const response = await fetch(`${DISCORD_API}${path}`, init);

    if (response.status === 204) {
      return undefined as T;
    }

    const text = await response.text();
    let payload: unknown = null;

    if (text) {
      try {
        payload = JSON.parse(text) as unknown;
      } catch {
        payload = text;
      }
    }

    if (!response.ok) {
      const detail =
        typeof payload === "object" && payload && "message" in payload
          ? String((payload as { message: unknown }).message)
          : text.slice(0, 200);
      throw new Error(`Discord API ${method} ${path} failed (${response.status}): ${detail}`);
    }

    return payload as T;
  }
}

function trimEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function sanitizeDiscordChannelName(name: string): string {
  const cleaned = name
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s\-_.']/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);

  return cleaned.length >= 1 ? cleaned : "party";
}

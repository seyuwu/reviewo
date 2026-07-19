const DISCORD_INVITE_HOSTS = new Set(["discord.gg", "discord.com", "www.discord.com"]);

/** Extract invite code from discord.gg / discord.com/invite URLs. */
export function extractDiscordInviteCode(inviteUrl: string): string | null {
  try {
    const url = new URL(inviteUrl);
    if (!DISCORD_INVITE_HOSTS.has(url.hostname)) {
      return null;
    }

    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length === 0) {
      return null;
    }

    if (parts[0] === "invite" && parts[1]) {
      return parts[1];
    }

    return parts[0] ?? null;
  } catch {
    return null;
  }
}

export function isDiscordInviteUrl(href: string): boolean {
  return extractDiscordInviteCode(href) !== null;
}

/**
 * Open Discord without window.open popups (those get blocked after async API calls).
 * Tries desktop protocol first; if the app does not take focus, same-tab https invite.
 * Skips navigation when the bot already moved the user into voice.
 */
export function openDiscordPartyVoice(input: {
  channelId: string;
  guildId: string;
  inviteUrl: string;
  movedToVoice?: boolean;
}): void {
  if (input.movedToVoice) {
    // Already in the party VC — just focus the Discord app on that channel.
    pokeDiscordProtocol(`discord://-/channels/${input.guildId}/${input.channelId}`);
    return;
  }

  const code = extractDiscordInviteCode(input.inviteUrl);
  const httpsInvite = code ? `https://discord.gg/${code}` : input.inviteUrl;
  const protocolInvite = code ? `discord://-/invite/${code}` : null;
  const protocolChannel = `discord://-/channels/${input.guildId}/${input.channelId}`;

  launchDiscordWithoutPopup({
    httpsUrl: httpsInvite,
    protocolUrls: [protocolChannel, protocolInvite].filter((url): url is string => Boolean(url))
  });
}

/**
 * Prefer Discord desktop protocol, then same-tab https (no popup).
 */
export function openDiscordInvite(inviteUrl: string): void {
  const code = extractDiscordInviteCode(inviteUrl);
  const httpsUrl = code ? `https://discord.gg/${code}` : inviteUrl;
  const protocolUrl = code ? `discord://-/invite/${code}` : null;

  launchDiscordWithoutPopup({
    httpsUrl,
    protocolUrls: protocolUrl ? [protocolUrl] : []
  });
}

function launchDiscordWithoutPopup(input: {
  httpsUrl: string;
  protocolUrls: string[];
}): void {
  let cancelled = false;

  const cancelHttpsFallback = (): void => {
    cancelled = true;
  };

  // If Discord desktop claims the protocol, the page usually blurs.
  window.addEventListener("blur", cancelHttpsFallback, { once: true });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      cancelHttpsFallback();
    }
  }, { once: true });

  for (const protocolUrl of input.protocolUrls) {
    pokeDiscordProtocol(protocolUrl);
  }

  window.setTimeout(() => {
    if (cancelled) {
      return;
    }

    // Same tab — never a blocked popup. Discord web can hand off to the app.
    window.location.assign(input.httpsUrl);
  }, 900);
}

function pokeDiscordProtocol(protocolUrl: string): void {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.display = "none";
  frame.src = protocolUrl;
  document.body.appendChild(frame);
  window.setTimeout(() => {
    frame.remove();
  }, 2500);

  const anchor = document.createElement("a");
  anchor.href = protocolUrl;
  anchor.rel = "noopener noreferrer";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

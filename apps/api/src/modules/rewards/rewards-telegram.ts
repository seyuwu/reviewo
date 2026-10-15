export type TelegramCheckErrorCode =
  | "TIMEOUT"
  | "NETWORK"
  | "RATE_LIMIT"
  | "PROFILE_UNAVAILABLE"
  | "UNAVAILABLE"
  | "CONFIGURATION"
  | "INVALID_RESPONSE";

export class TelegramCheckError extends Error {
  constructor(readonly code: TelegramCheckErrorCode) {
    super(code);
  }
}

export function telegramUsername(value: unknown): string | null {
  return typeof value === "string" && /^[a-zA-Z0-9_]{1,32}$/.test(value) ? value : null;
}

// Bounded retries apply only to this background job, not the shared bot/search client.
export async function readTelegramProfile(telegramId: string) {
  const token = process.env["DOTA_BOT_TOKEN"];
  if (!token) throw new TelegramCheckError("CONFIGURATION");
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/getChat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: telegramId }),
        signal: AbortSignal.timeout(8000),
        redirect: "error"
      });
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        if (response.status === 429) throw new TelegramCheckError("RATE_LIMIT");
        if (response.status === 401) throw new TelegramCheckError("CONFIGURATION");
        if (response.status === 400 || response.status === 403)
          throw new TelegramCheckError("PROFILE_UNAVAILABLE");
        throw new TelegramCheckError("UNAVAILABLE");
      }
      const data = (await response.json()) as {
        ok?: boolean;
        result?: { id?: number; first_name?: string; last_name?: string; username?: string };
      };
      if (
        !data ||
        typeof data !== "object" ||
        !data.ok ||
        String(data.result?.id) !== telegramId ||
        typeof data.result?.first_name !== "string"
      )
        throw new TelegramCheckError("INVALID_RESPONSE");
      return {
        name: `${data.result.first_name} ${typeof data.result.last_name === "string" ? data.result.last_name : ""}`
          .trim()
          .slice(0, 256),
        username: telegramUsername(data.result.username)
      };
    } catch (error) {
      const safe =
        error instanceof TelegramCheckError
          ? error
          : new TelegramCheckError(
              error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)
                ? "TIMEOUT"
                : error instanceof SyntaxError
                  ? "INVALID_RESPONSE"
                  : "NETWORK"
            );
      if (attempt === 0 && ["TIMEOUT", "NETWORK", "UNAVAILABLE"].includes(safe.code)) continue;
      // Never propagate fetch's URL (which contains the bot token).
      throw safe;
    }
  }
}

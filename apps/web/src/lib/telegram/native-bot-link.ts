export function telegramAppUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "t.me" ||
      !/^\/[A-Za-z0-9_]{5,32}$/.test(url.pathname)) {
    throw new Error("Invalid Telegram bot link");
  }
  const start = url.searchParams.get("start");
  if (start && !/^[A-Za-z0-9_-]{1,64}$/.test(start)) {
    throw new Error("Invalid Telegram start parameter");
  }
  const native = new URL("tg://resolve");
  native.searchParams.set("domain", url.pathname.slice(1));
  if (start) native.searchParams.set("start", start);
  return native.toString();
}

export function telegramBotHandle(value: string): string {
  const native = new URL(telegramAppUrl(value));
  return `@${native.searchParams.get("domain")}`;
}

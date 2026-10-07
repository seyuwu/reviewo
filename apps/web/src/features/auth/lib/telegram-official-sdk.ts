export type TelegramOfficialResult = { id_token?: string; error?: string };
type TelegramLoginSdk = {
  auth: (
    options: { client_id: number; scope: string[]; nonce: string },
    callback: (result: TelegramOfficialResult | null) => void
  ) => void;
  close?: () => void;
};

declare global {
  interface Window {
    Telegram?: { Login?: TelegramLoginSdk };
  }
}

let sdkPromise: Promise<TelegramLoginSdk> | null = null;
let popupOwner: symbol | null = null;

export function reserveTelegramPopup(owner: symbol): boolean {
  if (popupOwner !== null) return false;
  popupOwner = owner;
  return true;
}

export function releaseTelegramPopup(owner: symbol, close = false): void {
  if (popupOwner !== owner) return;
  if (close) window.Telegram?.Login?.close?.();
  popupOwner = null;
}

export function loadTelegramOfficialSdk(): Promise<TelegramLoginSdk> {
  sdkPromise ??= new Promise<TelegramLoginSdk>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-login.js";
    script.async = true;
    const timeout = window.setTimeout(() => fail(), 15000);
    function fail() {
      window.clearTimeout(timeout);
      script.remove();
      sdkPromise = null;
      reject(new Error("Telegram Login could not be loaded"));
    }
    script.onerror = fail;
    script.onload = () => {
      window.clearTimeout(timeout);
      const sdk = window.Telegram?.Login;
      if (!sdk?.auth) {
        fail();
        return;
      }
      resolve(sdk);
    };
    document.head.appendChild(script);
  });
  return sdkPromise;
}

import type { TranslateFn } from "@reviewo/i18n";

const TOAST_HOST_ID = "reviewo-disable-everywhere-toast-host";
const TOAST_AUTO_DISMISS_MS = 12_000;

const TOAST_STYLES = `
:host {
  all: initial;
  position: fixed;
  inset: auto 20px 20px auto;
  z-index: 2147483646;
}

.reviewo-disable-everywhere-toast {
  animation: reviewo-toast-enter 220ms ease;
  background: #ffffff;
  border: 1px solid rgba(212, 175, 55, 0.35);
  border-radius: 14px;
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.18);
  display: grid;
  gap: 10px;
  max-width: min(320px, calc(100vw - 40px));
  padding: 12px 14px;
}

.reviewo-disable-everywhere-toast-copy {
  color: #525252;
  font-family: "Segoe UI", system-ui, sans-serif;
  font-size: 12px;
  line-height: 1.45;
  margin: 0;
}

.reviewo-disable-everywhere-toast-kbd {
  color: #171717;
  font-weight: 700;
}

.reviewo-disable-everywhere-toast-dismiss {
  background: #fafafa;
  border: 1px solid #e5e7eb;
  border-radius: 999px;
  color: #171717;
  cursor: pointer;
  font-family: "Segoe UI", system-ui, sans-serif;
  font-size: 12px;
  font-weight: 700;
  justify-self: start;
  padding: 6px 12px;
}

.reviewo-disable-everywhere-toast-dismiss:hover,
.reviewo-disable-everywhere-toast-dismiss:focus-visible {
  background: #f5f5f5;
  border-color: #d4d4d4;
}

@keyframes reviewo-toast-enter {
  from {
    opacity: 0;
    transform: translateY(8px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
`;

export function showDisableEverywhereFeedback(options: {
  hotkeyEnabled: boolean;
  hotkeyLabel: string;
  t: TranslateFn;
}): void {
  removeDisableEverywhereFeedback();

  const host = document.createElement("div");
  host.id = TOAST_HOST_ID;

  const shadowRoot = host.attachShadow({ mode: "open" });
  const styleElement = document.createElement("style");
  styleElement.textContent = TOAST_STYLES;

  const toastCopy = options.hotkeyEnabled
    ? options.t("snooze.disableEverywhere.toast", {
        hotkey: `<span class="reviewo-disable-everywhere-toast-kbd">${escapeHtmlText(options.hotkeyLabel)}</span>`
      })
    : options.t("snooze.disableEverywhere.toastNoHotkey");

  const toastElement = document.createElement("section");
  toastElement.className = "reviewo-disable-everywhere-toast";
  toastElement.innerHTML = `
    <p class="reviewo-disable-everywhere-toast-copy">${toastCopy}</p>
    <button type="button" class="reviewo-disable-everywhere-toast-dismiss" data-disable-everywhere-dismiss>
      ${escapeHtmlText(options.t("common.gotIt"))}
    </button>
  `;

  shadowRoot.append(styleElement, toastElement);
  document.documentElement.append(host);

  const dismissTimer = window.setTimeout(() => {
    removeDisableEverywhereFeedback();
  }, TOAST_AUTO_DISMISS_MS);

  toastElement.querySelector<HTMLButtonElement>("[data-disable-everywhere-dismiss]")?.addEventListener(
    "click",
    () => {
      window.clearTimeout(dismissTimer);
      removeDisableEverywhereFeedback();
    },
    { once: true }
  );
}

export function removeDisableEverywhereFeedback(): void {
  document.getElementById(TOAST_HOST_ID)?.remove();
}

function escapeHtmlText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

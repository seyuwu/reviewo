export const ENTITY_CHAT_LOCALES = ["ru", "en"] as const;

export type EntityChatLocale = (typeof ENTITY_CHAT_LOCALES)[number];

export const DEFAULT_ENTITY_CHAT_LOCALE: EntityChatLocale = "ru";

export function buildEntityChatConnectionKey(
  entityId: string,
  locale: EntityChatLocale = DEFAULT_ENTITY_CHAT_LOCALE
): string {
  return `${entityId}:${locale}`;
}

export function appendEntityChatLocaleParam(
  params: URLSearchParams,
  locale: EntityChatLocale
): void {
  if (locale !== DEFAULT_ENTITY_CHAT_LOCALE) {
    params.set("locale", locale);
  }
}

export function buildEntityChatLocaleQuery(locale: EntityChatLocale): string {
  return locale === DEFAULT_ENTITY_CHAT_LOCALE ? "" : `?locale=${locale}`;
}

export function bindEntityChatLocaleSwitch(
  container: HTMLElement,
  onChange: (locale: EntityChatLocale) => void
): void {
  container.querySelectorAll<HTMLButtonElement>("[data-chat-locale]").forEach((button) => {
    button.addEventListener("click", () => {
      const locale = button.dataset.chatLocale;

      if (locale === "ru" || locale === "en") {
        onChange(locale);
      }
    });
  });
}

export type EntityChatLocaleSelectorSurface = "popup" | "overlay";

function popupChatLocaleButtonInlineStyle(isActive: boolean): string {
  const base =
    "appearance:none;border-radius:999px;cursor:pointer;font:inherit;font-size:0.6875rem;font-weight:700;letter-spacing:0.04em;line-height:1;min-width:2rem;padding:0.35rem 0.5rem;width:auto;";

  if (isActive) {
    return `${base}background:#171717;border:1px solid #171717;color:#ffffff;`;
  }

  return `${base}background:#ffffff;border:1px solid #a3a3a3;color:#171717;`;
}

export function updateEntityChatLocaleSelectorUi(
  container: ParentNode,
  selectedLocale: EntityChatLocale,
  options: { surface?: EntityChatLocaleSelectorSurface } = {}
): void {
  const isPopup = options.surface === "popup";
  const buttonClass = isPopup ? "popup-chat-locale-button" : "entity-chat-locale-button";

  container.querySelectorAll<HTMLButtonElement>("[data-chat-locale]").forEach((button) => {
    const locale = button.dataset.chatLocale;
    const isActive = locale === selectedLocale;

    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");

    if (isPopup && button.classList.contains(buttonClass)) {
      button.style.cssText = popupChatLocaleButtonInlineStyle(isActive);
    }
  });
}

export function renderEntityChatLocaleSelectorMarkup(
  selectedLocale: EntityChatLocale,
  options: { surface?: EntityChatLocaleSelectorSurface } = {}
): string {
  const isPopup = options.surface === "popup";
  const switchClass = isPopup ? "popup-chat-locale-switch" : "entity-chat-locale-switch";
  const buttonClass = isPopup ? "popup-chat-locale-button" : "entity-chat-locale-button";

  return `
    <div class="${switchClass}" role="group" aria-label="Chat language">
      ${ENTITY_CHAT_LOCALES.map((locale) => {
        const isActive = locale === selectedLocale;

        return `
          <button
            type="button"
            class="${buttonClass}${isActive ? " is-active" : ""}"
            data-chat-locale="${locale}"
            aria-pressed="${isActive ? "true" : "false"}"
            ${isPopup ? `style="${popupChatLocaleButtonInlineStyle(isActive)}"` : ""}
          >
            ${locale.toUpperCase()}
          </button>
        `;
      }).join("")}
    </div>
  `;
}

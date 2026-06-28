const POPUP_CHAT_HEIGHT_STORAGE_KEY = "reviewo:popup-chat-drawer-height";
const CARD_CHAT_HEIGHT_STORAGE_KEY = "reviewo:card-chat-drawer-height";

export const POPUP_CHAT_DRAWER_DEFAULT_HEIGHT_PX = 272;
export const POPUP_CHAT_DRAWER_MIN_HEIGHT_PX = 160;
export const CARD_CHAT_DRAWER_DEFAULT_HEIGHT_PX = 260;
export const CARD_CHAT_DRAWER_MIN_HEIGHT_PX = 160;

export interface ChatDrawerResizeConfig {
  defaultHeightPx: number;
  getMaxHeightPx: () => number;
  minHeightPx: number;
  storageKey: string;
}

export const popupChatDrawerResizeConfig: ChatDrawerResizeConfig = {
  defaultHeightPx: POPUP_CHAT_DRAWER_DEFAULT_HEIGHT_PX,
  getMaxHeightPx: () => getPopupChatDrawerMaxHeightPx(),
  minHeightPx: POPUP_CHAT_DRAWER_MIN_HEIGHT_PX,
  storageKey: POPUP_CHAT_HEIGHT_STORAGE_KEY
};

function getPopupChatDrawerMaxHeightPx(): number {
  const popupBody = document.querySelector<HTMLElement>(".popup-body");
  const isChatExpanded = document.documentElement.classList.contains("popup-chat-expanded");
  const chatDock = document.querySelector<HTMLElement>(
    ".entity-chat-actions.is-chat-expanded, .home-chat-actions.is-chat-expanded"
  );

  if (isChatExpanded && chatDock) {
    const toggle = chatDock.querySelector<HTMLElement>(".chat-toggle-button");
    const dockStyle = getComputedStyle(chatDock);
    const dockPaddingY =
      parseFloat(dockStyle.paddingTop) + parseFloat(dockStyle.paddingBottom);
    const toggleHeight = toggle?.offsetHeight ?? 40;
    const toggleMarginTop = toggle ? parseFloat(getComputedStyle(toggle).marginTop) || 0 : 0;
    const maxPanelHeight = Math.floor(
      chatDock.clientHeight - toggleHeight - toggleMarginTop - dockPaddingY
    );

    if (maxPanelHeight >= POPUP_CHAT_DRAWER_MIN_HEIGHT_PX) {
      return maxPanelHeight;
    }

    if (maxPanelHeight > 0) {
      return Math.max(96, maxPanelHeight);
    }
  }

  if (isChatExpanded && chatDock && popupBody) {
    const toggle = chatDock.querySelector<HTMLElement>(".chat-toggle-button");
    const toggleHeight = (toggle?.offsetHeight ?? 40) + 12;
    const available = Math.floor(
      popupBody.getBoundingClientRect().bottom - chatDock.getBoundingClientRect().top - toggleHeight
    );

    if (available >= POPUP_CHAT_DRAWER_MIN_HEIGHT_PX) {
      return available;
    }
  }

  const header = document.querySelector<HTMLElement>(".popup-header");
  const footer = document.querySelector<HTMLElement>(".popup-footer");
  const chatDockAny = document.querySelector<HTMLElement>(".entity-chat-actions, .home-chat-actions");
  const reservedChrome =
    (header?.getBoundingClientRect().height ?? 52) +
    (footer?.getBoundingClientRect().height ?? 56) +
    (chatDockAny ? 56 : 0);

  const viewportLimit = Math.max(
    POPUP_CHAT_DRAWER_MIN_HEIGHT_PX,
    Math.round((window.innerHeight || document.documentElement.clientHeight || 512) - reservedChrome)
  );

  if (!popupBody) {
    return Math.min(320, viewportLimit);
  }

  const bodyLimit = Math.max(POPUP_CHAT_DRAWER_MIN_HEIGHT_PX, Math.round(popupBody.clientHeight * 0.55));

  return Math.min(bodyLimit, viewportLimit);
}

export const cardChatDrawerResizeConfig: ChatDrawerResizeConfig = {
  defaultHeightPx: CARD_CHAT_DRAWER_DEFAULT_HEIGHT_PX,
  getMaxHeightPx: () => getCardChatDrawerMaxHeightPx(),
  minHeightPx: CARD_CHAT_DRAWER_MIN_HEIGHT_PX,
  storageKey: CARD_CHAT_HEIGHT_STORAGE_KEY
};

export function getCardChatDrawerMaxHeightPx(cardShell?: HTMLElement | null): number {
  const shell =
    cardShell ?? document.querySelector<HTMLElement>(".reviewo-card-shell.is-chat-expanded");

  const viewportCap = Math.max(
    CARD_CHAT_DRAWER_MIN_HEIGHT_PX,
    Math.min(window.innerHeight * 0.55, 420)
  );

  if (!shell) {
    return viewportCap;
  }

  const card = shell.querySelector<HTMLElement>(".reviewo-card");

  if (!card) {
    return viewportCap;
  }

  const cardStyle = getComputedStyle(card);
  const cardPaddingY =
    parseFloat(cardStyle.paddingTop) + parseFloat(cardStyle.paddingBottom);
  const cardMax = Math.min(
    window.innerHeight * 0.85,
    680,
    Math.max(0, window.innerHeight - card.getBoundingClientRect().top - 12)
  );

  const scroll = card.querySelector<HTMLElement>(".reviewo-card-scroll");
  const details = card.querySelector<HTMLElement>(".reviewo-details");
  const toggle = shell.querySelector<HTMLElement>(".reviewo-chat-toggle");
  const chatSection = shell.querySelector<HTMLElement>("[data-reviewo-chat-section]");

  let sectionOverhead = 0;

  if (chatSection) {
    const sectionStyle = getComputedStyle(chatSection);
    sectionOverhead =
      parseFloat(sectionStyle.paddingTop) +
      parseFloat(sectionStyle.paddingBottom) +
      parseFloat(sectionStyle.borderTopWidth);
  }

  const detailsMarginTop = details ? parseFloat(getComputedStyle(details).marginTop) : 0;
  const abovePanel =
    (scroll?.getBoundingClientRect().height ?? 0) +
    (details?.getBoundingClientRect().height ?? 0) +
    detailsMarginTop;
  const toggleBlock = (toggle?.getBoundingClientRect().height ?? 42) + 8;
  const available = cardMax - cardPaddingY - abovePanel - toggleBlock - sectionOverhead;
  const fitted = Math.floor(available);

  if (fitted < CARD_CHAT_DRAWER_MIN_HEIGHT_PX) {
    return Math.max(96, fitted);
  }

  return Math.min(viewportCap, fitted);
}

export function readStoredChatDrawerHeight(config: ChatDrawerResizeConfig): number {
  const raw = localStorage.getItem(config.storageKey);
  const parsed = raw ? Number(raw) : Number.NaN;

  if (!Number.isFinite(parsed)) {
    return config.defaultHeightPx;
  }

  return clampChatDrawerHeight(parsed, config);
}

export function applyChatDrawerHeight(drawer: HTMLElement, config: ChatDrawerResizeConfig): number {
  const cardShell = drawer.closest<HTMLElement>(".reviewo-card-shell");
  const maxHeightPx =
    config.storageKey === CARD_CHAT_HEIGHT_STORAGE_KEY
      ? getCardChatDrawerMaxHeightPx(cardShell)
      : config.getMaxHeightPx();
  const height = clampChatDrawerHeight(readStoredChatDrawerHeight(config), config, maxHeightPx);
  drawer.style.height = `${height}px`;
  drawer.style.maxHeight = `${height}px`;
  syncChatPanelMaxHeight(drawer);

  return height;
}

export function syncChatPanelMaxHeight(drawer: HTMLElement): void {
  const panel = drawer.closest<HTMLElement>("[data-reviewo-chat-panel], [data-chat-drawer-panel]");

  if (!panel) {
    return;
  }

  const height = drawer.getBoundingClientRect().height;

  if (height <= 0) {
    return;
  }

  panel.style.setProperty("--reviewo-chat-panel-max-height", `${Math.ceil(height)}px`);
}

export function bindChatDrawerResizeHandle(
  drawer: HTMLElement,
  handle: HTMLElement,
  config: ChatDrawerResizeConfig
): void {
  applyChatDrawerHeight(drawer, config);

  handle.addEventListener("pointerdown", (event) => {
    event.preventDefault();

    const startY = event.clientY;
    const startHeight = drawer.getBoundingClientRect().height;
    handle.setPointerCapture(event.pointerId);

    const onPointerMove = (moveEvent: PointerEvent): void => {
      const maxHeightPx =
        config.storageKey === CARD_CHAT_HEIGHT_STORAGE_KEY
          ? getCardChatDrawerMaxHeightPx(drawer.closest<HTMLElement>(".reviewo-card-shell"))
          : config.getMaxHeightPx();
      const nextHeight = clampChatDrawerHeight(
        startHeight + (moveEvent.clientY - startY),
        config,
        maxHeightPx
      );

      drawer.style.height = `${nextHeight}px`;
      drawer.style.maxHeight = `${nextHeight}px`;
      syncChatPanelMaxHeight(drawer);
    };

    const finish = (finishEvent: PointerEvent): void => {
      handle.releasePointerCapture(finishEvent.pointerId);
      handle.removeEventListener("pointermove", onPointerMove);
      handle.removeEventListener("pointerup", finish);
      handle.removeEventListener("pointercancel", finish);

      const maxHeightPx =
        config.storageKey === CARD_CHAT_HEIGHT_STORAGE_KEY
          ? getCardChatDrawerMaxHeightPx(drawer.closest<HTMLElement>(".reviewo-card-shell"))
          : config.getMaxHeightPx();
      const finalHeight = clampChatDrawerHeight(drawer.getBoundingClientRect().height, config, maxHeightPx);
      drawer.style.height = `${finalHeight}px`;
      drawer.style.maxHeight = `${finalHeight}px`;
      syncChatPanelMaxHeight(drawer);
      localStorage.setItem(config.storageKey, String(finalHeight));
    };

    handle.addEventListener("pointermove", onPointerMove);
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
  });
}

function clampChatDrawerHeight(
  value: number,
  config: ChatDrawerResizeConfig,
  maxHeightPx = config.getMaxHeightPx()
): number {
  return Math.min(maxHeightPx, Math.max(config.minHeightPx, Math.round(value)));
}

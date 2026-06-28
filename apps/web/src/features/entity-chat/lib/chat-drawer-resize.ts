const WEB_CHAT_HEIGHT_STORAGE_KEY = "reviewo:web-chat-drawer-height";
const WEB_CHAT_DRAWER_DEFAULT_HEIGHT_PX = 272;
const WEB_CHAT_DRAWER_MIN_HEIGHT_PX = 160;

export interface ChatDrawerResizeConfig {
  defaultHeightPx: number;
  getMaxHeightPx: () => number;
  minHeightPx: number;
  storageKey: string;
}

export const webChatDrawerResizeConfig: ChatDrawerResizeConfig = {
  defaultHeightPx: WEB_CHAT_DRAWER_DEFAULT_HEIGHT_PX,
  getMaxHeightPx: () => getWebChatDrawerMaxHeightPx(),
  minHeightPx: WEB_CHAT_DRAWER_MIN_HEIGHT_PX,
  storageKey: WEB_CHAT_HEIGHT_STORAGE_KEY
};

function getWebChatDrawerMaxHeightPx(): number {
  const viewportLimit = Math.max(
    WEB_CHAT_DRAWER_MIN_HEIGHT_PX,
    Math.min(520, Math.round((window.innerHeight || document.documentElement.clientHeight || 720) * 0.45))
  );

  return viewportLimit;
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
  const maxHeightPx = config.getMaxHeightPx();
  const height = clampChatDrawerHeight(readStoredChatDrawerHeight(config), config, maxHeightPx);
  drawer.style.height = `${height}px`;
  drawer.style.maxHeight = `${height}px`;
  syncChatPanelMaxHeight(drawer);

  return height;
}

export function syncChatPanelMaxHeight(drawer: HTMLElement): void {
  const panel = drawer.closest<HTMLElement>("[data-chat-drawer-panel]");

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
      const maxHeightPx = config.getMaxHeightPx();
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

      const maxHeightPx = config.getMaxHeightPx();
      const finalHeight = clampChatDrawerHeight(
        drawer.getBoundingClientRect().height,
        config,
        maxHeightPx
      );
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

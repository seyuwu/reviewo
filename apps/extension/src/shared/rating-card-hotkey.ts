import type { TranslateFn } from "@reviewo/i18n";

export const MODIFIER_ONLY_HOTKEY_CODE = "ModifierOnly";

export interface RatingCardHotkey {
  altKey: boolean;
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

export const DEFAULT_RATING_CARD_HOTKEY: RatingCardHotkey = {
  altKey: true,
  code: MODIFIER_ONLY_HOTKEY_CODE,
  ctrlKey: true,
  metaKey: false,
  shiftKey: false
};

const MODIFIER_KEY_CODES = new Set([
  "AltLeft",
  "AltRight",
  "ControlLeft",
  "ControlRight",
  "MetaLeft",
  "MetaRight",
  "ShiftLeft",
  "ShiftRight"
]);

export function isModifierOnlyHotkey(hotkey: RatingCardHotkey): boolean {
  return hotkey.code === MODIFIER_ONLY_HOTKEY_CODE;
}

export function normalizeRatingCardHotkey(value: unknown): RatingCardHotkey {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_RATING_CARD_HOTKEY };
  }

  const record = value as Partial<RatingCardHotkey>;

  if (typeof record.code !== "string" || !record.code.trim()) {
    return { ...DEFAULT_RATING_CARD_HOTKEY };
  }

  return {
    altKey: record.altKey === true,
    code: record.code,
    ctrlKey: record.ctrlKey === true,
    metaKey: record.metaKey === true,
    shiftKey: record.shiftKey === true
  };
}

export function matchesRatingCardHotkey(
  event: Pick<KeyboardEvent, "altKey" | "code" | "ctrlKey" | "metaKey" | "shiftKey">,
  hotkey: RatingCardHotkey
): boolean {
  if (isModifierOnlyHotkey(hotkey)) {
    if (!MODIFIER_KEY_CODES.has(event.code)) {
      return false;
    }

    return (
      event.altKey === hotkey.altKey &&
      event.ctrlKey === hotkey.ctrlKey &&
      event.metaKey === hotkey.metaKey &&
      event.shiftKey === hotkey.shiftKey &&
      countActiveModifiers(event) >= 2
    );
  }

  return (
    event.code === hotkey.code &&
    event.altKey === hotkey.altKey &&
    event.ctrlKey === hotkey.ctrlKey &&
    event.metaKey === hotkey.metaKey &&
    event.shiftKey === hotkey.shiftKey
  );
}

export function captureRatingCardHotkeyFromKeyboardEvent(
  event: KeyboardEvent
): RatingCardHotkey | null {
  if (MODIFIER_KEY_CODES.has(event.code)) {
    if (countActiveModifiers(event) < 2) {
      return null;
    }

    return {
      altKey: event.altKey,
      code: MODIFIER_ONLY_HOTKEY_CODE,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey
    };
  }

  return {
    altKey: event.altKey,
    code: event.code,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey
  };
}

export function formatRatingCardHotkeyLabel(hotkey: RatingCardHotkey, t?: TranslateFn): string {
  if (!t) {
    return formatRatingCardHotkeyLabelFallback(hotkey);
  }

  const modifiers: string[] = [];

  if (hotkey.ctrlKey) {
    modifiers.push(t("hotkey.modifier.ctrl"));
  }

  if (hotkey.altKey) {
    modifiers.push(t("hotkey.modifier.alt"));
  }

  if (hotkey.shiftKey) {
    modifiers.push(t("hotkey.modifier.shift"));
  }

  if (hotkey.metaKey) {
    modifiers.push(t("hotkey.modifier.meta"));
  }

  if (isModifierOnlyHotkey(hotkey)) {
    return modifiers.join(" + ");
  }

  const keyLabel = formatHotkeyCodeLabel(hotkey.code);

  if (modifiers.length === 0) {
    return keyLabel;
  }

  return t("hotkey.label", { key: keyLabel, modifiers: modifiers.join(" + ") });
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName;

  if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") {
    return true;
  }

  return target.isContentEditable;
}

function formatRatingCardHotkeyLabelFallback(hotkey: RatingCardHotkey): string {
  const parts: string[] = [];

  if (hotkey.ctrlKey) {
    parts.push("Ctrl");
  }

  if (hotkey.altKey) {
    parts.push("Alt");
  }

  if (hotkey.shiftKey) {
    parts.push("Shift");
  }

  if (hotkey.metaKey) {
    parts.push("Meta");
  }

  if (!isModifierOnlyHotkey(hotkey)) {
    parts.push(formatHotkeyCodeLabel(hotkey.code));
  }

  return parts.join(" + ");
}

function countActiveModifiers(event: Pick<KeyboardEvent, "altKey" | "ctrlKey" | "metaKey" | "shiftKey">): number {
  return [event.ctrlKey, event.altKey, event.shiftKey, event.metaKey].filter(Boolean).length;
}

function formatHotkeyCodeLabel(code: string): string {
  if (code.startsWith("Key")) {
    return code.slice(3);
  }

  if (code.startsWith("Digit")) {
    return code.slice(5);
  }

  return code.replace("Arrow", "");
}

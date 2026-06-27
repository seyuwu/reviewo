const CONTENT_SCRIPT_PORT_NAME = "reviewo-content-script";
const teardownCallbacks: Array<() => void> = [];
let contextInvalidated = false;
let guardsInstalled = false;

export function installExtensionContextGuards(): void {
  if (guardsInstalled) {
    return;
  }

  guardsInstalled = true;
  installExtensionContextErrorHandlers();
  watchExtensionContextLifetime();
}

export function isExtensionContextValid(): boolean {
  if (contextInvalidated) {
    return false;
  }

  try {
    return Boolean(chrome.runtime?.id);
  } catch {
    markExtensionContextInvalidated();
    return false;
  }
}

export function isExtensionContextInvalidatedMessage(message?: string): boolean {
  if (!message) {
    return false;
  }

  return message.toLowerCase().includes("extension context invalidated");
}

export function onExtensionContextInvalidated(teardown: () => void): void {
  if (contextInvalidated) {
    return;
  }

  teardownCallbacks.push(teardown);
}

export function markExtensionContextInvalidated(): void {
  if (contextInvalidated) {
    return;
  }

  contextInvalidated = true;
  runTeardown();
}

export function guardExtensionContext(): boolean {
  try {
    return isExtensionContextValid();
  } catch {
    markExtensionContextInvalidated();
    return false;
  }
}

export function runWithExtensionContext(work: () => void): void {
  if (!guardExtensionContext()) {
    return;
  }

  try {
    work();
  } catch (error) {
    if (error instanceof Error && isExtensionContextInvalidatedMessage(error.message)) {
      markExtensionContextInvalidated();
      return;
    }

    throw error;
  }
}

export function sendRuntimeMessage(
  message: unknown,
  callback?: (response: unknown) => void
): boolean {
  if (!guardExtensionContext()) {
    return false;
  }

  try {
    if (callback) {
      chrome.runtime.sendMessage(message, (response) => {
        try {
          const lastError = readRuntimeLastError();

          if (lastError) {
            if (isExtensionContextInvalidatedMessage(lastError.message)) {
              markExtensionContextInvalidated();
            }

            return;
          }

          callback(response);
        } catch {
          markExtensionContextInvalidated();
        }
      });
    } else {
      chrome.runtime.sendMessage(message);
    }

    return true;
  } catch {
    markExtensionContextInvalidated();
    return false;
  }
}

export function addStorageChangedListener(
  listener: Parameters<typeof chrome.storage.onChanged.addListener>[0]
): boolean {
  if (!guardExtensionContext()) {
    return false;
  }

  try {
    chrome.storage.onChanged.addListener(listener);
    return true;
  } catch {
    markExtensionContextInvalidated();
    return false;
  }
}

export function removeStorageChangedListener(
  listener: Parameters<typeof chrome.storage.onChanged.removeListener>[0]
): void {
  if (!guardExtensionContext()) {
    return;
  }

  try {
    chrome.storage.onChanged.removeListener(listener);
  } catch {
    markExtensionContextInvalidated();
  }
}

function watchExtensionContextLifetime(): void {
  try {
    const port = chrome.runtime.connect({ name: CONTENT_SCRIPT_PORT_NAME });

    port.onDisconnect.addListener(() => {
      readRuntimeLastError();
      markExtensionContextInvalidated();
    });
  } catch {
    markExtensionContextInvalidated();
  }
}

function installExtensionContextErrorHandlers(): void {
  window.addEventListener("error", (event) => {
    if (!isExtensionContextInvalidatedMessage(event.message)) {
      return;
    }

    event.preventDefault();
    markExtensionContextInvalidated();
  });

  window.addEventListener("unhandledrejection", (event) => {
    const message =
      event.reason instanceof Error ? event.reason.message : String(event.reason ?? "");

    if (!isExtensionContextInvalidatedMessage(message)) {
      return;
    }

    event.preventDefault();
    markExtensionContextInvalidated();
  });
}

function readRuntimeLastError(): chrome.runtime.LastError | undefined {
  try {
    return chrome.runtime.lastError;
  } catch (error) {
    if (error instanceof Error && isExtensionContextInvalidatedMessage(error.message)) {
      markExtensionContextInvalidated();
    }

    return undefined;
  }
}

function runTeardown(): void {
  for (const teardown of teardownCallbacks) {
    try {
      teardown();
    } catch {
      // Ignore teardown failures from a dead extension context.
    }
  }

  teardownCallbacks.length = 0;
}

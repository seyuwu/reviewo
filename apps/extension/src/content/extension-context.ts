const CONTENT_SCRIPT_PORT_NAME = "reviewo-content-script";
const PORT_RECONNECT_DELAY_MS = 250;
const RUNTIME_MESSAGE_RETRY_DELAY_MS = 200;
const RUNTIME_MESSAGE_MAX_ATTEMPTS = 3;
const teardownCallbacks: Array<() => void> = [];
let contextInvalidated = false;
let guardsInstalled = false;
let activeLifetimePort: chrome.runtime.Port | null = null;

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

function isTransientRuntimeError(message?: string): boolean {
  if (!message) {
    return false;
  }

  const normalized = message.toLowerCase();

  return (
    normalized.includes("could not establish connection") ||
    normalized.includes("receiving end does not exist") ||
    normalized.includes("message port closed")
  );
}

function isExtensionRuntimeAvailable(): boolean {
  try {
    return Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
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
  callback?: (response: unknown) => void,
  attempt = 0
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
            const errorMessage = lastError.message;

            if (isExtensionContextInvalidatedMessage(errorMessage)) {
              markExtensionContextInvalidated();
              return;
            }

            if (
              attempt + 1 < RUNTIME_MESSAGE_MAX_ATTEMPTS &&
              isTransientRuntimeError(errorMessage) &&
              isExtensionRuntimeAvailable()
            ) {
              window.setTimeout(() => {
                sendRuntimeMessage(message, callback, attempt + 1);
              }, RUNTIME_MESSAGE_RETRY_DELAY_MS);
              return;
            }

            return;
          }

          callback(response);
        } catch (error) {
          if (
            error instanceof Error &&
            isExtensionContextInvalidatedMessage(error.message)
          ) {
            markExtensionContextInvalidated();
          }
        }
      });
    } else {
      chrome.runtime.sendMessage(message);
    }

    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      isExtensionContextInvalidatedMessage(error.message)
    ) {
      markExtensionContextInvalidated();
    } else if (!isExtensionRuntimeAvailable()) {
      markExtensionContextInvalidated();
    }

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
  if (contextInvalidated) {
    return;
  }

  if (!isExtensionRuntimeAvailable()) {
    markExtensionContextInvalidated();
    return;
  }

  try {
    if (activeLifetimePort) {
      try {
        activeLifetimePort.disconnect();
      } catch {
        // Ignore disconnect errors from an already-closed port.
      }

      activeLifetimePort = null;
    }

    const port = chrome.runtime.connect({ name: CONTENT_SCRIPT_PORT_NAME });
    activeLifetimePort = port;

    port.onDisconnect.addListener(() => {
      activeLifetimePort = null;
      readRuntimeLastError();

      if (!isExtensionRuntimeAvailable()) {
        markExtensionContextInvalidated();
        return;
      }

      // MV3 service workers go idle and drop ports; reconnect without tearing down.
      window.setTimeout(() => {
        watchExtensionContextLifetime();
      }, PORT_RECONNECT_DELAY_MS);
    });
  } catch {
    if (!isExtensionRuntimeAvailable()) {
      markExtensionContextInvalidated();
    }
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

interface ExtensionRuntimeResponse {
  payload?: {
    data?: unknown;
    message?: string;
    session?: unknown;
  };
  type?: string;
}

export function sendExtensionMessage(message: unknown): Promise<ExtensionRuntimeResponse | null> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }

      resolve(response as ExtensionRuntimeResponse);
    });
  });
}

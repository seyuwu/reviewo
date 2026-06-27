export function sendExtensionMessage<TResponse = unknown>(
  message: unknown
): Promise<TResponse | null> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }

      resolve(response as TResponse);
    });
  });
}

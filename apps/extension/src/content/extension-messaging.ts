import {
  guardExtensionContext,
  isExtensionContextInvalidatedMessage,
  markExtensionContextInvalidated,
  sendRuntimeMessage
} from "./extension-context.js";

interface ExtensionRuntimeResponse {
  payload?: {
    data?: unknown;
    message?: string;
    session?: unknown;
  };
  type?: string;
}

export function sendExtensionMessage(message: unknown): Promise<ExtensionRuntimeResponse | null> {
  if (!guardExtensionContext()) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const sent = sendRuntimeMessage(message, (response) => {
      resolve(response as ExtensionRuntimeResponse);
    });

    if (!sent) {
      resolve(null);
    }
  });
}

export function handleExtensionMessagingError(message?: string): boolean {
  if (!isExtensionContextInvalidatedMessage(message)) {
    return false;
  }

  markExtensionContextInvalidated();
  return true;
}

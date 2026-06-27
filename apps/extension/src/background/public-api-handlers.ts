import { apiRequest } from "./api-request.js";
import {
  createPublicApiErrorMessage,
  createPublicApiResultMessage,
  isExtensionPublicApiRequestMessage
} from "../shared/messages.js";

export function handlePublicApiMessage(
  message: unknown,
  sendResponse: (response: unknown) => void
): boolean {
  if (!isExtensionPublicApiRequestMessage(message)) {
    return false;
  }

  void apiRequest({
    method: "GET",
    path: message.payload.path
  })
    .then((result) => {
      if (!result.ok) {
        sendResponse(createPublicApiErrorMessage(result.errorMessage));
        return;
      }

      sendResponse(createPublicApiResultMessage(result.data, result.status));
    })
    .catch((error: unknown) => {
      const messageText = error instanceof Error ? error.message : "Public API request failed.";

      sendResponse(createPublicApiErrorMessage(messageText));
    });

  return true;
}

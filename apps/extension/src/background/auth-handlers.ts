import {
  authenticatedApiRequest,
  loginWithApi,
  persistAuthResponse,
  registerWithApi
} from "./auth-api.js";
import { clearAuthSession, getStoredAuthSession } from "./auth-session.js";
import { syncAuthFromWebJson } from "./web-auth-sync.js";
import {
  createAuthOperationErrorMessage,
  createAuthOperationSuccessMessage,
  createAuthSessionResultMessage,
  createAuthenticatedApiErrorMessage,
  createAuthenticatedApiResultMessage,
  isExtensionAuthenticatedApiRequestMessage,
  isExtensionAuthLoginMessage,
  isExtensionAuthRegisterMessage,
  isExtensionAuthSignOutMessage,
  isExtensionGetAuthSessionMessage,
  isExtensionSyncWebAuthMessage
} from "../shared/messages.js";

export function handleAuthMessage(
  message: unknown,
  sendResponse: (response: unknown) => void
): boolean {
  if (isExtensionGetAuthSessionMessage(message)) {
    void getStoredAuthSession()
      .then((session) => {
        sendResponse(createAuthSessionResultMessage(session));
      })
      .catch(() => {
        sendResponse(createAuthSessionResultMessage(null));
      });

    return true;
  }

  if (isExtensionAuthLoginMessage(message)) {
    void loginWithApi({
      email: message.payload.email.trim(),
      password: message.payload.password
    })
      .then(async (authResponse) => {
        const session = await persistAuthResponse(authResponse);
        sendResponse(createAuthOperationSuccessMessage(session));
      })
      .catch((error: unknown) => {
        const messageText =
          error instanceof Error ? error.message : "Extension login failed unexpectedly.";

        sendResponse(createAuthOperationErrorMessage(messageText));
      });

    return true;
  }

  if (isExtensionAuthRegisterMessage(message)) {
    void registerWithApi({
      displayName: message.payload.displayName.trim(),
      email: message.payload.email.trim(),
      password: message.payload.password
    })
      .then(async (authResponse) => {
        const session = await persistAuthResponse(authResponse);
        sendResponse(createAuthOperationSuccessMessage(session));
      })
      .catch((error: unknown) => {
        const messageText =
          error instanceof Error ? error.message : "Extension registration failed unexpectedly.";

        sendResponse(createAuthOperationErrorMessage(messageText));
      });

    return true;
  }

  if (isExtensionAuthSignOutMessage(message)) {
    void clearAuthSession()
      .then(() => {
        sendResponse(createAuthSessionResultMessage(null));
      })
      .catch(() => {
        sendResponse(createAuthOperationErrorMessage("Could not sign out."));
      });

    return true;
  }

  if (isExtensionSyncWebAuthMessage(message)) {
    void syncAuthFromWebJson(message.payload.rawAuthJson)
      .then(async () => {
        const session = await getStoredAuthSession();
        sendResponse(createAuthSessionResultMessage(session));
      })
      .catch(() => {
        sendResponse(createAuthSessionResultMessage(null));
      });

    return true;
  }

  if (isExtensionAuthenticatedApiRequestMessage(message)) {
    void authenticatedApiRequest({
      path: message.payload.path,
      ...(message.payload.method === undefined ? {} : { method: message.payload.method }),
      ...(message.payload.body === undefined ? {} : { body: message.payload.body })
    })
      .then((result) => {
        sendResponse(createAuthenticatedApiResultMessage(result.data, result.status));
      })
      .catch((error: unknown) => {
        const messageText =
          error instanceof Error ? error.message : "Authenticated API request failed.";

        sendResponse(createAuthenticatedApiErrorMessage(messageText));
      });

    return true;
  }

  return false;
}

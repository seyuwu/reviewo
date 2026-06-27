import { createGetAuthSessionMessage, ExtensionMessageType } from "../../shared/messages.js";
import { sendExtensionMessage } from "../extension-messaging.js";

export async function hasAuthenticatedExtensionSession(): Promise<boolean> {
  const response = await sendExtensionMessage(createGetAuthSessionMessage());

  return (
    response?.type === ExtensionMessageType.AuthSessionResult &&
    response.payload?.session !== null &&
    response.payload?.session !== undefined
  );
}

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

export async function getExtensionSessionUserId(): Promise<string | undefined> {
  const response = await sendExtensionMessage(createGetAuthSessionMessage());

  if (response?.type !== ExtensionMessageType.AuthSessionResult) {
    return undefined;
  }

  return response.payload?.session?.userId;
}

export async function getExtensionSessionAccessToken(): Promise<string | null> {
  const response = await sendExtensionMessage(createGetAuthSessionMessage());

  if (response?.type !== ExtensionMessageType.AuthSessionResult) {
    return null;
  }

  return response.payload?.session?.accessToken ?? null;
}

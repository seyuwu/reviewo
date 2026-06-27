export function shouldPushWebAuthToExtension(
  rawAuthJson: string | null,
  lastKnownWebAuthJson: string | null | undefined
): boolean {
  if (!rawAuthJson) {
    return false;
  }

  return rawAuthJson !== lastKnownWebAuthJson;
}

export function shouldPullExtensionAuthToWeb(options: {
  webSignedOutLocally: boolean;
}): boolean {
  return !options.webSignedOutLocally;
}

export function shouldApplyWebAuthToExtension(options: {
  currentExtensionAccessToken: string | null;
  extensionTokenValid: boolean;
  webAccessToken: string;
  webTokenValid: boolean;
}): boolean {
  if (!options.webTokenValid) {
    return false;
  }

  if (options.currentExtensionAccessToken === options.webAccessToken) {
    return false;
  }

  if (options.currentExtensionAccessToken && options.extensionTokenValid) {
    return false;
  }

  return true;
}

export function shouldClearExtensionSessionOn401(options: {
  clearSessionOnUnauthorized?: boolean;
  method?: "DELETE" | "GET" | "POST" | "PUT";
}): boolean {
  if (options.clearSessionOnUnauthorized === true) {
    return true;
  }

  return false;
}

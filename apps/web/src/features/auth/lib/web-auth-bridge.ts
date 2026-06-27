export const WEB_AUTH_BRIDGE_SOURCE = "reviewo-web";

export type WebAuthBridgeMessage =
  | { source: typeof WEB_AUTH_BRIDGE_SOURCE; type: "reviewo:web-auth-changed" }
  | { source: typeof WEB_AUTH_BRIDGE_SOURCE; type: "reviewo:web-sign-out" };

export function notifyWebAuthChanged(): void {
  window.dispatchEvent(new Event("reviewo:web-auth-changed"));
  postWebAuthBridgeMessage({ source: WEB_AUTH_BRIDGE_SOURCE, type: "reviewo:web-auth-changed" });
}

export function notifyWebSignOut(): void {
  window.dispatchEvent(new Event("reviewo:web-auth-changed"));
  window.dispatchEvent(new Event("reviewo:web-sign-out"));
  postWebAuthBridgeMessage({ source: WEB_AUTH_BRIDGE_SOURCE, type: "reviewo:web-sign-out" });
}

function postWebAuthBridgeMessage(message: WebAuthBridgeMessage): void {
  window.postMessage(message, window.location.origin);
}

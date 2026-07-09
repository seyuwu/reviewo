import { mountPopupApp } from "./app.js";
import { resetPopupChatDrawerSessionState } from "./components/chat-drawer.js";

resetPopupChatDrawerSessionState();

window.addEventListener("pagehide", () => {
  resetPopupChatDrawerSessionState();
});

const root = document.querySelector<HTMLElement>("#popup-root");

if (root) {
  mountPopupApp(root);
}

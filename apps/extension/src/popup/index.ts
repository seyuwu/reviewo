import { mountPopupApp } from "./app.js";

const root = document.querySelector<HTMLElement>("#popup-root");

if (root) {
  mountPopupApp(root);
}

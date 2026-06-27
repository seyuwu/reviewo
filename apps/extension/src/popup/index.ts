import { mountAuthPanel } from "./auth-panel.js";
import { createGetActiveTabResolveMessage, ExtensionMessageType } from "../shared/messages.js";
import type { ExtensionResolveResponse } from "../shared/types/resolve.js";

const authRoot = document.querySelector<HTMLElement>("#auth-root");
const statusElement = document.querySelector<HTMLParagraphElement>("#status");
const refreshButton = document.querySelector<HTMLButtonElement>("#refresh-button");

function setStatus(message: string, tone: "default" | "success" | "error" = "default"): void {
  if (!statusElement) {
    return;
  }

  statusElement.textContent = message;
  statusElement.classList.remove("status-copy-success", "status-copy-error");

  if (tone === "success") {
    statusElement.classList.add("status-copy-success");
  }

  if (tone === "error") {
    statusElement.classList.add("status-copy-error");
  }
}

function formatResolveStatus(
  url: string | null,
  result: ExtensionResolveResponse | null
): { message: string; tone: "default" | "success" | "error" } {
  if (!url) {
    return {
      message: "No active page URL is available for resolve.",
      tone: "error"
    };
  }

  if (!result) {
    return {
      message: "This page URL cannot be resolved by Reviewo.",
      tone: "default"
    };
  }

  if (result.status === "found") {
    return {
      message: `Found "${result.entity.title}" for the current page.`,
      tone: "success"
    };
  }

  return {
    message: "No Reviewo entity exists for the current page yet.",
    tone: "default"
  };
}

function requestActiveTabResolve(): void {
  setStatus("Resolving active tab URL...");

  chrome.runtime.sendMessage(createGetActiveTabResolveMessage(), (response) => {
    if (chrome.runtime.lastError) {
      setStatus(`Background unavailable: ${chrome.runtime.lastError.message}`, "error");
      return;
    }

    if (response?.type === ExtensionMessageType.ActiveTabResolveResult) {
      const { message, tone } = formatResolveStatus(response.payload.url, response.payload.result);
      setStatus(message, tone);
      return;
    }

    setStatus("Background returned an unexpected resolve response.", "error");
  });
}

if (authRoot) {
  mountAuthPanel(authRoot);
}

refreshButton?.addEventListener("click", () => {
  requestActiveTabResolve();
});

requestActiveTabResolve();

import type { ExtensionStoredAuthSession } from "../shared/types/auth.js";
import { createGetAuthSessionMessage, createPingMessage, ExtensionMessageType } from "../shared/messages.js";
import { mountAuthForm, signOutCurrentUser } from "./components/auth-form.js";
import { PopupNavigation } from "./navigation.js";
import { fetchActiveTabResolve } from "./services/active-tab-resolve.js";
import { rememberRecentEntity } from "./services/recent-entities.js";
import { sendExtensionMessage } from "./services/popup-messaging.js";
import { renderEntityScreen } from "./screens/entity-screen.js";
import { renderHomeScreen } from "./screens/home-screen.js";
import { renderSearchScreen } from "./screens/search-screen.js";
import { renderSettingsScreen } from "./screens/settings-screen.js";
import {
  createPopupShell,
  renderAuthPromptSlot,
  updateShellChrome,
  type PopupShellElements
} from "./shell.js";
import type { EntityViewModel, RecentEntityRecord } from "./types.js";

export function mountPopupApp(root: HTMLElement): void {
  const shell = createPopupShell(root);
  const navigation = new PopupNavigation();
  let session: ExtensionStoredAuthSession | null = null;
  let isSessionLoaded = false;
  let showAuthPrompt = false;
  let backgroundUnavailable = false;

  shell.accountButton.addEventListener("click", () => {
    if (session) {
      return;
    }

    showAuthPrompt = !showAuthPrompt;
    void render();
  });

  shell.backButton.addEventListener("click", () => {
    navigation.goBack();
    void render();
  });

  shell.settingsButton.addEventListener("click", () => {
    navigation.openSettings();
    void render();
  });

  shell.logoutButton.addEventListener("click", () => {
    void signOutCurrentUser().then(async () => {
      session = null;
      showAuthPrompt = false;
      await loadSession();
      await render();
    });
  });

  async function loadSession(): Promise<void> {
    const pingResponse = await sendExtensionMessage<{ type?: string }>(createPingMessage("popup"));
    backgroundUnavailable = pingResponse?.type !== ExtensionMessageType.PongFromBackground;

    const response = await sendExtensionMessage<{
      payload?: { session?: ExtensionStoredAuthSession | null };
      type?: string;
    }>(createGetAuthSessionMessage());

    if (response?.type === ExtensionMessageType.AuthSessionResult) {
      session = response.payload?.session ?? null;
    }

    isSessionLoaded = true;
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !("reviewo.extensionAuth" in changes)) {
      return;
    }

    void loadSession().then(() => render());
  });

  async function openEntity(entity: EntityViewModel, returnTo: "HOME" | "SEARCH"): Promise<void> {
    if (entity.entityId && entity.entityPagePath) {
      await rememberRecentEntity({
        canonicalUrl: entity.canonicalUrl || null,
        entityPagePath: entity.entityPagePath,
        id: entity.entityId,
        slug: entity.title.toLowerCase().replaceAll(/\s+/g, "-"),
        title: entity.title
      });
    }

    navigation.openEntity(entity, returnTo);
    await render();
  }

  async function renderScreenBody(elements: PopupShellElements): Promise<void> {
    const screen = navigation.current;
    const shouldShowAuth = showAuthPrompt && !session;

    elements.body
      .querySelectorAll(".popup-alert")
      .forEach((node) => node.remove());

    if (backgroundUnavailable) {
      const alert = document.createElement("p");
      alert.className = "status-copy-error popup-alert";
      alert.textContent =
        "Extension background is unavailable. Reload Reviewo on chrome://extensions and ensure the API is running at http://localhost:3000.";
      elements.body.prepend(alert);
    }

    let authSlot = elements.body.querySelector<HTMLElement>(".auth-prompt-slot");

    if (!shouldShowAuth) {
      authSlot?.remove();
    } else if (!authSlot) {
      authSlot = renderAuthPromptSlot(elements.body, session);
      mountAuthForm({
        onSessionChange: (nextSession) => {
          session = nextSession;

          if (nextSession) {
            showAuthPrompt = false;
          }

          void render();
        },
        root: authSlot
      });
    } else if (authSlot) {
      authSlot.hidden = false;
    }

    let screenHost = elements.body.querySelector<HTMLElement>(".screen-host");

    if (!screenHost) {
      screenHost = document.createElement("div");
      screenHost.className = "screen-host";
      elements.body.append(screenHost);
    }

    screenHost.innerHTML = "";

    if (screen.name === "HOME") {
      const activeTab = await fetchActiveTabResolve();
      await renderHomeScreen(screenHost, activeTab, {
        onOpenChild: (entity) => {
          void openEntity(entity, "HOME");
        },
        onOpenCurrentPage: (entity) => {
          void openEntity(entity, "HOME");
        },
        onOpenRecent: (record: RecentEntityRecord) => {
          void openEntity(
            {
              canonicalUrl: record.canonicalUrl ?? "",
              entityId: record.id,
              entityPagePath: record.entityPagePath,
              pageUrl: record.canonicalUrl ?? "",
              status: "found",
              title: record.title
            },
            "HOME"
          );
        },
        onSearch: (query) => {
          navigation.openSearch(query);
          void render();
        }
      });
      return;
    }

    if (screen.name === "SEARCH") {
      await renderSearchScreen(screenHost, screen.query, {
        onOpenEntity: (entity) => {
          void openEntity(entity, "SEARCH");
        },
        onQueryChange: (query) => {
          navigation.replaceSearch(query);
          void render();
        }
      });
      return;
    }

    if (screen.name === "ENTITY") {
      await renderEntityScreen(screenHost, screen.entity, {
        onEntityUpdate: (updatedEntity) => {
          navigation.updateCurrentEntity(updatedEntity);
          void render();
        },
        onOpenParent: (parentEntity) => {
          void openEntity(parentEntity, screen.returnTo);
        }
      });
      return;
    }

    if (screen.name === "SETTINGS") {
      await renderSettingsScreen(screenHost);
    }
  }

  async function render(): Promise<void> {
    updateShellChrome(shell, {
      canGoBack: navigation.canGoBack(),
      session,
      showAuthPrompt,
      isSessionLoaded
    });

    await renderScreenBody(shell);
  }

  void loadSession().then(() => render());
}

import type { ExtensionStoredAuthSession } from "../shared/types/auth.js";
import { createGetAuthSessionMessage, createPingMessage, ExtensionMessageType } from "../shared/messages.js";
import { ENTITY_RATINGS_STORAGE_KEY } from "../shared/entity-rating-sync.js";
import { SITE_SNOOZE_STORAGE_KEY } from "../shared/site-snooze.js";
import { mountAuthForm, signOutCurrentUser } from "./components/auth-form.js";
import { PopupNavigation } from "./navigation.js";
import { fetchActiveTabResolve } from "./services/active-tab-resolve.js";
import { rememberRecentEntity } from "./services/recent-entities.js";
import { sendExtensionMessage } from "./services/popup-messaging.js";
import { renderEntityScreen } from "./screens/entity-screen.js";
import { renderHomeScreen } from "./screens/home-screen.js";
import { renderSearchScreen } from "./screens/search-screen.js";
import { renderSettingsScreen } from "./screens/settings-screen.js";
import { syncSiteSnoozeBanner } from "./site-snooze-banner.js";
import { buildEntityPageUrl } from "./view-helpers.js";
import {
  createPopupShell,
  ensureAuthPromptSlot,
  setAuthPromptVisible,
  updateFooterEntityLink,
  updateShellChrome,
  type PopupShellElements
} from "./shell.js";
import type { EntityViewModel, RecentEntityRecord } from "./types.js";

interface RenderOptions {
  refreshScreen?: boolean;
}

export function mountPopupApp(root: HTMLElement): void {
  const shell = createPopupShell(root);
  const navigation = new PopupNavigation();
  let session: ExtensionStoredAuthSession | null = null;
  let isSessionLoaded = false;
  let showAuthPrompt = false;
  let backgroundUnavailable = false;
  let lastScreenKey = "";
  let authFormMounted = false;

  shell.accountButton.addEventListener("click", () => {
    if (session) {
      return;
    }

    showAuthPrompt = !showAuthPrompt;
    void render();
  });

  shell.backButton.addEventListener("click", () => {
    navigation.goBack();
    void render({ refreshScreen: true });
  });

  shell.settingsButton.addEventListener("click", () => {
    navigation.openSettings();
    void render({ refreshScreen: true });
  });

  shell.logoutButton.addEventListener("click", () => {
    void signOutCurrentUser().then(async () => {
      session = null;
      showAuthPrompt = false;
      await loadSession();
      await render({ refreshScreen: true });
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
    if (areaName !== "local") {
      return;
    }

    if ("reviewo.extensionAuth" in changes || ENTITY_RATINGS_STORAGE_KEY in changes) {
      void loadSession().then(() => {
        const shouldRefreshHome =
          navigation.current.name === "HOME" && ENTITY_RATINGS_STORAGE_KEY in changes;

        void render({ refreshScreen: shouldRefreshHome });
      });
    }

    if (SITE_SNOOZE_STORAGE_KEY in changes) {
      void render();
    }
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
    await render({ refreshScreen: true });
  }

  function syncAuthPrompt(elements: PopupShellElements): void {
    const shouldShowAuth = showAuthPrompt && !session;
    const authMount = ensureAuthPromptSlot(elements.body);

    if (!authFormMounted) {
      mountAuthForm({
        onSessionChange: (nextSession) => {
          session = nextSession;

          if (nextSession) {
            showAuthPrompt = false;
          }

          void render({ refreshScreen: navigation.current.name === "HOME" });
        },
        root: authMount
      });
      authFormMounted = true;
    }

    setAuthPromptVisible(elements.body, shouldShowAuth);
  }

  function syncBackgroundAlert(elements: PopupShellElements): void {
    elements.body.querySelectorAll(".popup-alert").forEach((node) => node.remove());

    if (!backgroundUnavailable) {
      return;
    }

    const alert = document.createElement("p");
    alert.className = "status-copy-error popup-alert ui-fade-soft";
    alert.textContent =
      "Extension background is unavailable. Reload Reviewo on chrome://extensions and ensure the API is running at http://localhost:3000.";
    elements.body.prepend(alert);
  }

  async function renderScreenBody(elements: PopupShellElements): Promise<void> {
    const screen = navigation.current;

    let screenHost = elements.body.querySelector<HTMLElement>(".screen-host");

    if (!screenHost) {
      screenHost = document.createElement("div");
      screenHost.className = "screen-host";
      elements.body.append(screenHost);
    }

    screenHost.classList.remove("screen-enter");
    void screenHost.offsetWidth;
    screenHost.classList.add("screen-enter");
    screenHost.innerHTML = "";

    if (screen.name === "HOME") {
      const activeTab = await fetchActiveTabResolve();
      await renderHomeScreen(screenHost, activeTab, {
        onCurrentPageRated: () => {
          void render({ refreshScreen: true });
        },
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
          void render({ refreshScreen: true });
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
        }
      });
      return;
    }

    if (screen.name === "ENTITY") {
      await renderEntityScreen(screenHost, screen.entity, {
        onEntityUpdate: (updatedEntity) => {
          navigation.updateCurrentEntity(updatedEntity);
          void render({ refreshScreen: true });
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

  async function render(options: RenderOptions = {}): Promise<void> {
    const activeTab = await fetchActiveTabResolve();
    const entityPageUrl =
      activeTab.result?.status === "found"
        ? buildEntityPageUrl(activeTab.result.web.entityPagePath)
        : null;

    updateShellChrome(shell, {
      canGoBack: navigation.canGoBack(),
      session,
      showAuthPrompt,
      isSessionLoaded
    });
    updateFooterEntityLink(shell, entityPageUrl);

    syncBackgroundAlert(shell);
    syncAuthPrompt(shell);
    await syncSiteSnoozeBanner(shell.body, activeTab, () => {
      void render({ refreshScreen: true });
    });

    const screenKey = JSON.stringify(navigation.current);
    const shouldRefreshScreen = options.refreshScreen === true || screenKey !== lastScreenKey;

    if (!shouldRefreshScreen) {
      return;
    }

    lastScreenKey = screenKey;
    await renderScreenBody(shell);
  }

  void loadSession().then(() => render({ refreshScreen: true }));
}

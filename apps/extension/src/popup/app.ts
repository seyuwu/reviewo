import type { ExtensionStoredAuthSession } from "../shared/types/auth.js";
import { extensionConfig } from "../shared/config.js";
import { createGetAuthSessionMessage, createPingMessage, ExtensionMessageType } from "../shared/messages.js";
import { ENTITY_RATINGS_STORAGE_KEY } from "../shared/entity-rating-sync.js";
import { SITE_SNOOZE_STORAGE_KEY } from "../shared/site-snooze.js";
import { EXTENSION_PREFERENCES_STORAGE_KEY } from "../shared/preferences.js";
import { createExtensionTranslator } from "../shared/extension-i18n.js";
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
import { readExtensionPreferences } from "../shared/extension-preferences-storage.js";
import {
  bindPopupWelcomeBanner,
  renderPopupWelcomeBannerMarkup,
  shouldShowPopupWelcomeBanner
} from "./popup-onboarding-banner.js";
import { dismissPopupWelcome } from "../shared/extension-onboarding-storage.js";
import {
  bindPopupLocaleSwitcher,
  renderPopupLocaleSwitcherMarkup
} from "./popup-locale-switcher.js";
import {
  applyPopupShellLabels,
  createPopupShell,
  ensureAuthPromptSlot,
  setAuthPromptVisible,
  updateFooterEntityLink,
  updateShellChrome,
  type PopupShellElements
} from "./shell.js";
import type { EntityViewModel, RecentEntityRecord } from "./types.js";
import { LOCALE_PREFERENCE_STORAGE_KEY } from "@reviewo/i18n";
import type { TranslateFn } from "@reviewo/i18n";

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

  async function applyPopupChrome(t: TranslateFn): Promise<void> {
    applyPopupShellLabels(shell, t);
    updateShellChrome(shell, t, {
      canGoBack: navigation.canGoBack(),
      session,
      showAuthPrompt,
      isSessionLoaded
    });
    syncBackgroundAlert(shell, t);
    syncAuthPrompt(shell, t);
  }

  function openAuthPrompt(): void {
    if (session) {
      return;
    }

    showAuthPrompt = true;
    void applyPopupChromeWithTranslator();
    shell.body.scrollTop = 0;
  }

  shell.accountButton.addEventListener("click", () => {
    if (session) {
      return;
    }

    showAuthPrompt = !showAuthPrompt;
    void applyPopupChromeWithTranslator();

    if (showAuthPrompt) {
      shell.body.scrollTop = 0;
    }

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

    if (EXTENSION_PREFERENCES_STORAGE_KEY in changes || LOCALE_PREFERENCE_STORAGE_KEY in changes) {
      authFormMounted = false;
      void render({ refreshScreen: true });
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

  function syncAuthPrompt(elements: PopupShellElements, t: TranslateFn): void {
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
        root: authMount,
        t
      });
      authFormMounted = true;
    }

    setAuthPromptVisible(elements.body, shouldShowAuth);
  }

  function syncBackgroundAlert(elements: PopupShellElements, t: TranslateFn): void {
    elements.body.querySelectorAll(".popup-alert").forEach((node) => node.remove());

    if (!backgroundUnavailable) {
      return;
    }

    const alert = document.createElement("p");
    alert.className = "status-copy-error popup-alert ui-fade-soft";
    alert.textContent = t("errors.backgroundUnavailable", { apiUrl: extensionConfig.apiBaseUrl });
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
        onOpenActiveEntity: (item) => {
          void openEntity(
            {
              canonicalUrl: "",
              entityId: item.entityId,
              entityPagePath: `/entities/${item.entityId}`,
              pageUrl: "",
              status: "found",
              title: item.entityTitle
            },
            "HOME"
          );
        },
        onRequestSignIn: openAuthPrompt,
        onOpenSearchScreen: () => {
          navigation.openSearch("");
          void render({ refreshScreen: true });
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
        },
        onRequestSignIn: openAuthPrompt
      });
      return;
    }

    if (screen.name === "SETTINGS") {
      await renderSettingsScreen(screenHost);
    }
  }

  async function syncPopupLocaleSwitcher(elements: PopupShellElements, t: TranslateFn): Promise<void> {
    const preferences = await readExtensionPreferences();
    elements.localeMount.innerHTML = renderPopupLocaleSwitcherMarkup(t, preferences.locale);
    bindPopupLocaleSwitcher(elements.footer, () => {
      authFormMounted = false;
      void render({ refreshScreen: true });
    });
  }

  async function syncPopupOnboardingBanner(elements: PopupShellElements, t: TranslateFn): Promise<void> {
    elements.body.querySelector("[data-popup-onboarding-banner]")?.remove();

    if (navigation.current.name === "SETTINGS") {
      return;
    }

    if (!(await shouldShowPopupWelcomeBanner())) {
      return;
    }

    const preferences = await readExtensionPreferences();
    const mount = document.createElement("div");
    mount.innerHTML = renderPopupWelcomeBannerMarkup(preferences, t);
    const banner = mount.firstElementChild;

    if (!banner) {
      return;
    }

    elements.body.prepend(banner);
    bindPopupWelcomeBanner(elements.body, () => {
      void dismissPopupWelcome();
      navigation.openSettings();
      void render({ refreshScreen: true });
    });
  }

  async function refreshPopupData(options: RenderOptions = {}, t: TranslateFn): Promise<void> {
    const activeTab = await fetchActiveTabResolve();
    const entityPageUrl =
      activeTab.result?.status === "found"
        ? buildEntityPageUrl(activeTab.result.web.entityPagePath)
        : null;

    updateFooterEntityLink(shell, entityPageUrl);
    await syncSiteSnoozeBanner(shell.body, activeTab, t, () => {
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

  async function applyPopupChromeWithTranslator(): Promise<void> {
    const t = await createExtensionTranslator();
    await applyPopupChrome(t);
  }

  async function render(options: RenderOptions = {}): Promise<void> {
    const t = await createExtensionTranslator();
    await applyPopupChrome(t);
    await syncPopupLocaleSwitcher(shell, t);
    await syncPopupOnboardingBanner(shell, t);
    await refreshPopupData(options, t);
  }

  void loadSession().then(() => render({ refreshScreen: true }));
}

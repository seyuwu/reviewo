import type { TranslateFn } from "@reviewo/i18n";

import { createExtensionTranslator } from "../../shared/extension-i18n.js";
import { searchEntities, type SearchEntityResult } from "../services/search-entities.js";
import { entityViewFromSearchResult, escapeHtml } from "../view-helpers.js";
import type { EntityViewModel } from "../types.js";

const SEARCH_DEBOUNCE_MS = 250;

export interface SearchScreenActions {
  onOpenEntity: (entity: EntityViewModel) => void;
  onQueryChange: (query: string) => void;
}

export async function renderSearchScreen(
  container: HTMLElement,
  query: string,
  actions: SearchScreenActions
): Promise<void> {
  const t = await createExtensionTranslator();

  container.innerHTML = `
    <section class="screen search-screen">
      <form class="search-entry" data-search-form>
        <label class="field-label search-field-label">
          ${escapeHtml(t("home.search.label"))}
          <input
            name="query"
            type="search"
            value="${escapeHtml(query)}"
            placeholder="${escapeHtml(t("home.search.placeholder"))}"
            autocomplete="off"
          />
        </label>
        <button type="submit" class="primary-button">${escapeHtml(t("common.search"))}</button>
      </form>
      <div class="search-results-panel" data-search-results>
        <div class="search-state search-state-loading">
          <span class="state-dot state-dot-loading" aria-hidden="true"></span>
          ${escapeHtml(t("web.home.searching"))}
        </div>
      </div>
    </section>
  `;

  const form = container.querySelector<HTMLFormElement>("[data-search-form]");
  const input = container.querySelector<HTMLInputElement>('input[name="query"]');
  const resultsHost = container.querySelector<HTMLElement>("[data-search-results]");

  if (!form || !input || !resultsHost) {
    return;
  }

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let activeRequestId = 0;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void runSearch(input.value.trim(), true);
  });

  input.addEventListener("input", () => {
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      void runSearch(input.value.trim(), false);
    }, SEARCH_DEBOUNCE_MS);
  });

  async function runSearch(nextQuery: string, syncNavigationImmediately: boolean): Promise<void> {
    if (syncNavigationImmediately && nextQuery) {
      actions.onQueryChange(nextQuery);
    } else if (nextQuery) {
      actions.onQueryChange(nextQuery);
    }

    if (!nextQuery) {
      resultsHost.innerHTML = `
        <div class="search-state">
          <span class="state-dot" aria-hidden="true"></span>
          ${escapeHtml(t("popup.search.idle"))}
        </div>
      `;
      return;
    }

    const requestId = ++activeRequestId;
    resultsHost.classList.add("is-loading");

    if (!resultsHost.querySelector(".entity-list, .search-results-empty")) {
      resultsHost.innerHTML = `
        <div class="search-state search-state-loading">
          <span class="state-dot state-dot-loading" aria-hidden="true"></span>
          ${escapeHtml(t("web.home.searching"))}
        </div>
      `;
    }

    try {
      const response = await searchEntities(nextQuery);

      if (requestId !== activeRequestId) {
        return;
      }

      resultsHost.classList.remove("is-loading");
      resultsHost.innerHTML = renderSearchResults(t, response.results, response.canCreateEntity);
      bindSearchResults(resultsHost, response.results, actions);
    } catch {
      if (requestId !== activeRequestId) {
        return;
      }

      resultsHost.classList.remove("is-loading");
      resultsHost.innerHTML = `<p class="status-copy-error">${escapeHtml(t("popup.search.failed"))}</p>`;
    }
  }

  await runSearch(query.trim(), true);
}

function renderSearchResults(
  t: TranslateFn,
  results: SearchEntityResult[],
  canCreateEntity: boolean
): string {
  if (results.length === 0) {
    return `
      <section class="search-results-empty">
        <p class="muted-copy">${escapeHtml(t("popup.search.noResults"))}</p>
        ${canCreateEntity ? `<p class="muted-copy">${escapeHtml(t("popup.search.noResultsHint"))}</p>` : ""}
      </section>
    `;
  }

  return `
    <ul class="entity-list">
      ${results
        .map(
          (item) => `
        <li>
          <button type="button" class="entity-list-item" data-entity-id="${escapeHtml(item.id)}">
            <strong>${escapeHtml(item.title)}</strong>
            <span>${escapeHtml(item.slug)}</span>
          </button>
        </li>
      `
        )
        .join("")}
    </ul>
  `;
}

function bindSearchResults(
  host: HTMLElement,
  results: SearchEntityResult[],
  actions: SearchScreenActions
): void {
  host.querySelectorAll<HTMLButtonElement>("[data-entity-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const result = results.find((item) => item.id === button.dataset.entityId);

      if (result) {
        actions.onOpenEntity(entityViewFromSearchResult(result));
      }
    });
  });
}

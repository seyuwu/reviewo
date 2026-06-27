import { searchEntities, type SearchEntityResult } from "../services/search-entities.js";
import { entityViewFromSearchResult, escapeHtml } from "../view-helpers.js";
import type { EntityViewModel } from "../types.js";

export interface SearchScreenActions {
  onOpenEntity: (entity: EntityViewModel) => void;
  onQueryChange: (query: string) => void;
}

export async function renderSearchScreen(
  container: HTMLElement,
  query: string,
  actions: SearchScreenActions
): Promise<void> {
  container.innerHTML = `
    <section class="screen search-screen">
      <form class="search-entry" data-search-form>
        <label class="field-label search-field-label">
          Search Reviewo
          <input
            name="query"
            type="search"
            value="${escapeHtml(query)}"
            placeholder="youtube, github, amazon..."
            autocomplete="off"
          />
        </label>
        <button type="submit" class="primary-button">Search</button>
      </form>
      <div data-search-results>
        <p class="muted-copy">Searching...</p>
      </div>
    </section>
  `;

  const resultsHost = container.querySelector<HTMLElement>("[data-search-results]");

  container.querySelector("[data-search-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const nextQuery = String(new FormData(form).get("query") ?? "").trim();

    if (nextQuery) {
      actions.onQueryChange(nextQuery);
    }
  });

  if (!resultsHost) {
    return;
  }

  try {
    const response = await searchEntities(query);
    resultsHost.innerHTML = renderSearchResults(response.results, response.canCreateEntity);
    bindSearchResults(resultsHost, response.results, actions);
  } catch {
    resultsHost.innerHTML = `<p class="status-copy-error">Search failed. Check that the API is running.</p>`;
  }
}

function renderSearchResults(results: SearchEntityResult[], canCreateEntity: boolean): string {
  if (results.length === 0) {
    return `
      <section class="search-results-empty">
        <p class="muted-copy">No entities found.</p>
        ${canCreateEntity ? `<p class="muted-copy">Try a different query or rate the current page from Home.</p>` : ""}
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

import type { EntityScreenState, PopupScreenState } from "./types.js";

export class PopupNavigation {
  private readonly stack: PopupScreenState[] = [{ name: "HOME" }];

  get current(): PopupScreenState {
    return this.stack[this.stack.length - 1] ?? { name: "HOME" };
  }

  canGoBack(): boolean {
    return this.stack.length > 1;
  }

  goHome(): void {
    this.stack.length = 0;
    this.stack.push({ name: "HOME" });
  }

  openSearch(query: string): void {
    this.stack.push({ name: "SEARCH", query });
  }

  replaceSearch(query: string): void {
    const current = this.current;

    if (current.name === "SEARCH") {
      this.stack[this.stack.length - 1] = { name: "SEARCH", query };
      return;
    }

    this.openSearch(query);
  }

  openEntity(
    entity: EntityScreenState["entity"],
    returnTo: EntityScreenState["returnTo"] = "SEARCH"
  ): void {
    this.stack.push({ name: "ENTITY", entity, returnTo });
  }

  openSettings(): void {
    this.stack.push({ name: "SETTINGS" });
  }

  goBack(): void {
    if (this.stack.length <= 1) {
      return;
    }

    this.stack.pop();
  }

  updateCurrentEntity(entity: EntityScreenState["entity"]): void {
    const current = this.current;

    if (current.name !== "ENTITY") {
      return;
    }

    this.stack[this.stack.length - 1] = {
      ...current,
      entity
    };
  }
}

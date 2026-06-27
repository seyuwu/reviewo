import { readPageSourceTitle } from "./rating-card/read-page-title.js";

export function readCurrentPageSourceTitle(): string | undefined {
  return readPageSourceTitle();
}

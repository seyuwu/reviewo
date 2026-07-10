import assert from "node:assert/strict";
import test from "node:test";

import {
  moveDraftItemToIndex,
  moveDraftItemToPosition
} from "./top-editor-reorder.ts";

const items = ["a", "b", "c", "d", "e"];

test("moveDraftItemToPosition moves item to the requested rank", () => {
  assert.deepEqual(moveDraftItemToPosition(items, 4, 2), ["a", "e", "b", "c", "d"]);
});

test("moveDraftItemToPosition clamps invalid positions", () => {
  assert.deepEqual(moveDraftItemToPosition(items, 2, 99), ["a", "b", "d", "e", "c"]);
  assert.deepEqual(moveDraftItemToPosition(items, 2, 0), ["c", "a", "b", "d", "e"]);
});

test("moveDraftItemToIndex keeps array unchanged for noop moves", () => {
  assert.deepEqual(moveDraftItemToIndex(items, 2, 2), items);
  assert.deepEqual(moveDraftItemToIndex(items, -1, 1), items);
});

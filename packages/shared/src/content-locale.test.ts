import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  appendContentLocaleParam,
  inferReviewLocaleFromText,
  parseContentLocaleParam,
  resolveContentLocale
} from "./content-locale.js";

describe("content-locale", () => {
  it("parseContentLocaleParam accepts ru, en, and all", () => {
    assert.equal(parseContentLocaleParam("ru"), "ru");
    assert.equal(parseContentLocaleParam("en"), "en");
    assert.equal(parseContentLocaleParam("all"), "all");
    assert.equal(parseContentLocaleParam("fr"), undefined);
  });

  it("resolveContentLocale honors explicit preference", () => {
    assert.equal(resolveContentLocale("en", []), "en");
    assert.equal(resolveContentLocale("ru", []), "ru");
  });

  it("resolveContentLocale detects browser languages in auto mode", () => {
    assert.equal(resolveContentLocale("auto", ["en-US"]), "en");
    assert.equal(resolveContentLocale("auto", ["ru-RU"]), "ru");
  });

  it("inferReviewLocaleFromText uses cyrillic heuristic", () => {
    assert.equal(inferReviewLocaleFromText("Отличный сервис"), "ru");
    assert.equal(inferReviewLocaleFromText("Great product"), "en");
  });

  it("appendContentLocaleParam sets locale query param", () => {
    const params = new URLSearchParams();

    appendContentLocaleParam(params, "en");

    assert.equal(params.get("locale"), "en");
  });
});

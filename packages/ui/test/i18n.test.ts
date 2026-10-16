import { describe, expect, it } from "vitest";
import en from "../src/i18n/en.json";
import { formatDate, t, uiLanguage, translationDictionaries } from "../src/i18n/index.js";

describe("UI translations", () => {
  it("keeps every dictionary key represented in English and falls back to English", () => {
    const keys = Object.keys(en).filter((key) => key !== "_meta");
    for (const [language, dictionary] of Object.entries(translationDictionaries())) {
      if (language === "en") continue;
      for (const key of keys) expect(dictionary).toHaveProperty(key);
    }
    expect(uiLanguage("kn-IN")).toBe("kn");
    expect(uiLanguage("fr-FR")).toBe("en");
  });

  it("interpolates values and formats dates with the full locale", () => {
    expect(t("progress.steps", "en", { done: 3, total: 6 })).toBe("3 of 6 done");
    expect(formatDate("2026-10-16T00:00:00.000Z", "es-ES")).not.toBe(formatDate("2026-10-16T00:00:00.000Z", "en-US"));
  });
});

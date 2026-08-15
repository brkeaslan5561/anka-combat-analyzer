import { describe, expect, it } from "vitest";
import { languageFromLocale, translateUiText } from "../src/shared/i18n";

describe("language selection and UI translation", () => {
  it("uses Turkish only for Turkish Windows locales", () => {
    expect(languageFromLocale("tr-TR")).toBe("tr");
    expect(languageFromLocale("tr")).toBe("tr");
    expect(languageFromLocale("en-US")).toBe("en");
    expect(languageFromLocale("de-DE")).toBe("en");
  });

  it("translates general UI labels without touching combat terminology", () => {
    expect(translateUiText("Load Log", "tr")).toBe("Log Yükle");
    expect(translateUiText("All Encounters", "tr")).toBe("Tüm Karşılaşmalar");
    expect(translateUiText("combatDPS", "tr")).toBe("combatDPS");
    expect(translateUiText("EncDPS", "tr")).toBe("EncDPS");
    expect(translateUiText("DPS", "tr")).toBe("DPS");
  });

  it("can switch translated labels back to English", () => {
    expect(translateUiText("Log Yükle", "en")).toBe("Load Log");
    expect(translateUiText("Overlay: Açık", "en")).toBe("Overlay: On");
  });
});

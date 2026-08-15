import { describe, expect, it } from "vitest";
import {
  getMainUiZoom,
  normalizeOverlayScale,
} from "../src/shared/displaySettings";
import type { DisplayPreferences } from "../src/shared/types";

function preferences(
  patch: Partial<DisplayPreferences> = {},
): DisplayPreferences {
  return {
    uiResolutionPreset: "1920x1080",
    uiFontSize: "normal",
    overlayScale: 1,
    ...patch,
  };
}

describe("display settings", () => {
  it("uses 100% UI zoom for the recommended 1080p/normal profile", () => {
    expect(getMainUiZoom(preferences())).toBe(1);
  });

  it("scales the UI up for higher resolution and larger text", () => {
    expect(
      getMainUiZoom(
        preferences({
          uiResolutionPreset: "2560x1440",
          uiFontSize: "large",
        }),
      ),
    ).toBeCloseTo(1.21, 5);
  });

  it("scales the UI down for compact resolution and small text", () => {
    expect(
      getMainUiZoom(
        preferences({
          uiResolutionPreset: "1280x720",
          uiFontSize: "small",
        }),
      ),
    ).toBeCloseTo(0.756, 5);
  });

  it("clamps invalid overlay scaling to a safe range", () => {
    expect(normalizeOverlayScale(undefined)).toBe(1);
    expect(normalizeOverlayScale(0.1)).toBe(0.7);
    expect(normalizeOverlayScale(8)).toBe(1.6);
  });
});

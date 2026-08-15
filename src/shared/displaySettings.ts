import type { AppSettings, UiFontSize, UiResolutionPreset } from "./types";

export const UI_RESOLUTION_OPTIONS: Array<{
  value: UiResolutionPreset;
  label: string;
  scale: number;
}> = [
  { value: "1280x720", label: "1280 × 720 · Compact", scale: 0.84 },
  { value: "1600x900", label: "1600 × 900 · Medium", scale: 0.92 },
  { value: "1920x1080", label: "1920 × 1080 · Recommended", scale: 1 },
  { value: "2560x1440", label: "2560 × 1440 · Large", scale: 1.1 },
  { value: "3840x2160", label: "3840 × 2160 · 4K", scale: 1.22 },
];

export const UI_FONT_OPTIONS: Array<{
  value: UiFontSize;
  label: string;
  scale: number;
}> = [
  { value: "small", label: "Small", scale: 0.9 },
  { value: "normal", label: "Normal", scale: 1 },
  { value: "large", label: "Large", scale: 1.1 },
  { value: "xlarge", label: "Extra Large", scale: 1.2 },
];

export const OVERLAY_SCALE_OPTIONS = [0.8, 1, 1.2, 1.4] as const;

export function getMainUiZoom(
  settings: Pick<AppSettings, "uiResolutionPreset" | "uiFontSize">,
): number {
  const resolution =
    UI_RESOLUTION_OPTIONS.find(
      (item) => item.value === settings.uiResolutionPreset,
    )?.scale ?? 1;
  const font =
    UI_FONT_OPTIONS.find((item) => item.value === settings.uiFontSize)?.scale ?? 1;
  return clamp(resolution * font, 0.7, 1.55);
}

export function normalizeOverlayScale(value: number | undefined): number {
  if (!Number.isFinite(value)) return 1;
  return clamp(value ?? 1, 0.7, 1.6);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

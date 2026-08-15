import { app, BrowserWindow, ipcMain, screen } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import {
  getMainUiZoom,
  normalizeOverlayScale,
  UI_FONT_OPTIONS,
  UI_RESOLUTION_OPTIONS,
} from "../shared/displaySettings";
import { languageFromLocale } from "../shared/i18n";
import type {
  AppLanguage,
  DisplayPreferences,
  DisplaySettingsPatch,
  UiFontSize,
  UiResolutionPreset,
} from "../shared/types";

const BASE_OVERLAY_WIDTH = 380;
const BASE_OVERLAY_HEIGHT = 330;
const POSITION_SAVE_DELAY_MS = 180;

const BASE_DEFAULT_PREFERENCES = {
  uiResolutionPreset: "1920x1080" as UiResolutionPreset,
  uiFontSize: "normal" as UiFontSize,
  overlayScale: 1,
};

const RESOLUTIONS = new Set<UiResolutionPreset>(
  UI_RESOLUTION_OPTIONS.map((item) => item.value),
);
const FONT_SIZES = new Set<UiFontSize>(
  UI_FONT_OPTIONS.map((item) => item.value),
);
const LANGUAGES = new Set<AppLanguage>(["en", "tr"]);

let defaultPreferences: DisplayPreferences = {
  ...BASE_DEFAULT_PREFERENCES,
  language: "en",
};
let preferences: DisplayPreferences = { ...defaultPreferences };
let settingsPath = "";
let overlayMoveMode = false;
let positionSaveTimer: NodeJS.Timeout | null = null;
const configuredOverlayWindows = new WeakSet<BrowserWindow>();

const ready = app.whenReady().then(async () => {
  defaultPreferences = {
    ...BASE_DEFAULT_PREFERENCES,
    language: languageFromLocale(app.getLocale()),
  };
  settingsPath = path.join(app.getPath("userData"), "display-settings.json");
  preferences = await loadPreferences();
  for (const window of BrowserWindow.getAllWindows()) {
    void applyWindowPreferences(window);
  }
});

app.on("browser-window-created", (_event, window) => {
  const apply = () => void applyWindowPreferences(window);
  window.webContents.once("did-finish-load", apply);
});

ipcMain.handle("get-display-preferences", async () => {
  await ready;
  return preferences;
});

ipcMain.handle(
  "update-display-settings",
  async (_event, patch: DisplaySettingsPatch) => {
    await ready;
    preferences = sanitizePreferences({ ...preferences, ...patch });
    await savePreferences();
    await applyAllWindowPreferences();
    broadcastPreferences();
    return preferences;
  },
);

ipcMain.handle("begin-overlay-move", async () => {
  await ready;
  const window = findOverlayWindow();
  if (!window) return false;

  overlayMoveMode = true;
  window.setFocusable(true);
  window.setIgnoreMouseEvents(false);
  window.setResizable(false);
  window.show();
  window.focus();
  broadcastOverlayMoveMode(true);
  return true;
});

ipcMain.handle("finish-overlay-move", async () => {
  await ready;
  const window = findOverlayWindow();
  if (window) {
    await persistOverlayPosition(window);
    overlayMoveMode = false;
    broadcastOverlayMoveMode(false);
    window.setIgnoreMouseEvents(true, { forward: true });
    window.setFocusable(false);
    window.showInactive();
  }
  return preferences;
});

ipcMain.handle("reset-overlay-position", async () => {
  await ready;
  const window = findOverlayWindow();
  if (window) {
    const bounds = window.getBounds();
    const position = defaultOverlayPosition(bounds.width, bounds.height);
    window.setPosition(position.x, position.y, false);
    preferences = {
      ...preferences,
      overlayX: position.x,
      overlayY: position.y,
    };
  } else {
    const { overlayX: _overlayX, overlayY: _overlayY, ...rest } = preferences;
    preferences = rest;
  }
  await savePreferences();
  broadcastPreferences();
  return preferences;
});

async function loadPreferences(): Promise<DisplayPreferences> {
  try {
    const raw = await fs.readFile(settingsPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<DisplayPreferences>;
    return sanitizePreferences({ ...defaultPreferences, ...parsed });
  } catch {
    return { ...defaultPreferences };
  }
}

async function savePreferences(): Promise<void> {
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(
    settingsPath,
    `${JSON.stringify(preferences, null, 2)}\n`,
    "utf8",
  );
}

function sanitizePreferences(
  value: Partial<DisplayPreferences>,
): DisplayPreferences {
  const uiResolutionPreset = RESOLUTIONS.has(
    value.uiResolutionPreset as UiResolutionPreset,
  )
    ? (value.uiResolutionPreset as UiResolutionPreset)
    : defaultPreferences.uiResolutionPreset;
  const uiFontSize = FONT_SIZES.has(value.uiFontSize as UiFontSize)
    ? (value.uiFontSize as UiFontSize)
    : defaultPreferences.uiFontSize;
  const language = LANGUAGES.has(value.language as AppLanguage)
    ? (value.language as AppLanguage)
    : defaultPreferences.language;
  const overlayScale = normalizeOverlayScale(value.overlayScale);
  const next: DisplayPreferences = {
    uiResolutionPreset,
    uiFontSize,
    overlayScale,
    language,
  };
  if (Number.isFinite(value.overlayX)) next.overlayX = Math.round(value.overlayX!);
  if (Number.isFinite(value.overlayY)) next.overlayY = Math.round(value.overlayY!);
  return next;
}

async function applyAllWindowPreferences(): Promise<void> {
  for (const window of BrowserWindow.getAllWindows()) {
    await applyWindowPreferences(window);
  }
}

async function applyWindowPreferences(window: BrowserWindow): Promise<void> {
  await ready;
  if (window.isDestroyed()) return;
  if (isOverlayWindow(window)) {
    applyOverlayPreferences(window);
  } else {
    window.webContents.setZoomFactor(getMainUiZoom(preferences));
  }
}

function applyOverlayPreferences(window: BrowserWindow): void {
  const scale = normalizeOverlayScale(preferences.overlayScale);
  const width = Math.round(BASE_OVERLAY_WIDTH * scale);
  const height = Math.round(BASE_OVERLAY_HEIGHT * scale);
  const desired =
    Number.isFinite(preferences.overlayX) && Number.isFinite(preferences.overlayY)
      ? clampOverlayPosition(
          Math.round(preferences.overlayX!),
          Math.round(preferences.overlayY!),
          width,
          height,
        )
      : defaultOverlayPosition(width, height);

  window.webContents.setZoomFactor(scale);
  window.setBounds(
    {
      x: desired.x,
      y: desired.y,
      width,
      height,
    },
    false,
  );
  window.setResizable(false);
  if (!overlayMoveMode) {
    window.setFocusable(false);
    window.setIgnoreMouseEvents(true, { forward: true });
  }

  if (!configuredOverlayWindows.has(window)) {
    configuredOverlayWindows.add(window);
    window.on("move", () => scheduleOverlayPositionSave(window));
    window.on("closed", () => {
      if (positionSaveTimer) {
        clearTimeout(positionSaveTimer);
        positionSaveTimer = null;
      }
    });
  }

  window.webContents.send("display-preferences-changed", preferences);
  window.webContents.send("overlay-move-mode-changed", overlayMoveMode);
}

function scheduleOverlayPositionSave(window: BrowserWindow): void {
  if (!overlayMoveMode || window.isDestroyed()) return;
  if (positionSaveTimer) clearTimeout(positionSaveTimer);
  positionSaveTimer = setTimeout(() => {
    positionSaveTimer = null;
    void persistOverlayPosition(window);
  }, POSITION_SAVE_DELAY_MS);
}

async function persistOverlayPosition(window: BrowserWindow): Promise<void> {
  if (window.isDestroyed()) return;
  if (positionSaveTimer) {
    clearTimeout(positionSaveTimer);
    positionSaveTimer = null;
  }
  const { x, y } = window.getBounds();
  preferences = { ...preferences, overlayX: x, overlayY: y };
  await savePreferences();
  broadcastPreferences();
}

function defaultOverlayPosition(width: number, height: number): { x: number; y: number } {
  const workArea = screen.getPrimaryDisplay().workArea;
  return {
    x: workArea.x + Math.max(0, workArea.width - width - 20),
    y: workArea.y + 28,
  };
}

function clampOverlayPosition(
  x: number,
  y: number,
  width: number,
  height: number,
): { x: number; y: number } {
  const display = screen.getDisplayNearestPoint({ x, y });
  const area = display.workArea;
  const maxX = Math.max(area.x, area.x + area.width - width);
  const maxY = Math.max(area.y, area.y + area.height - height);
  return {
    x: Math.min(maxX, Math.max(area.x, x)),
    y: Math.min(maxY, Math.max(area.y, y)),
  };
}

function findOverlayWindow(): BrowserWindow | null {
  return BrowserWindow.getAllWindows().find(isOverlayWindow) ?? null;
}

function isOverlayWindow(window: BrowserWindow): boolean {
  try {
    const url = new URL(window.webContents.getURL());
    return url.searchParams.get("overlay") === "1";
  } catch {
    return false;
  }
}

function broadcastPreferences(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send("display-preferences-changed", preferences);
    }
  }
}

function broadcastOverlayMoveMode(moving: boolean): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send("overlay-move-mode-changed", moving);
    }
  }
}

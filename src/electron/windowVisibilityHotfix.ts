import { app, BrowserWindow } from "electron";

const WINDOW_REVEAL_FALLBACK_MS = 2500;

function isOverlayWindow(window: BrowserWindow): boolean {
  if (window.isAlwaysOnTop() && !window.isFocusable()) return true;
  try {
    const url = new URL(window.webContents.getURL());
    return url.searchParams.get("overlay") === "1";
  } catch {
    return false;
  }
}

function revealMainWindow(window: BrowserWindow): void {
  if (window.isDestroyed() || isOverlayWindow(window)) return;
  if (!window.isVisible()) window.show();
}

function protectWindow(window: BrowserWindow): void {
  if (isOverlayWindow(window)) return;

  window.webContents.once("did-finish-load", () => {
    queueMicrotask(() => revealMainWindow(window));
  });

  window.webContents.once("did-fail-load", () => {
    revealMainWindow(window);
  });

  const fallback = setTimeout(() => {
    revealMainWindow(window);
  }, WINDOW_REVEAL_FALLBACK_MS);
  fallback.unref?.();

  window.once("closed", () => clearTimeout(fallback));
}

app.on("browser-window-created", (_event, window) => {
  protectWindow(window);
});

void app.whenReady().then(() => {
  for (const window of BrowserWindow.getAllWindows()) protectWindow(window);
});

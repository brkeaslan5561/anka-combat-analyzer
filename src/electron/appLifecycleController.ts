import { app, BrowserWindow } from "electron";

const overlayWindows = new Set<BrowserWindow>();
let primaryWindow: BrowserWindow | null = null;
let quitting = false;

export const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!primaryWindow || primaryWindow.isDestroyed()) return;
    if (primaryWindow.isMinimized()) primaryWindow.restore();
    primaryWindow.show();
    primaryWindow.focus();
  });

  app.on("browser-window-created", (_event, window) => {
    if (isOverlayCandidate(window)) {
      overlayWindows.add(window);
      window.once("closed", () => overlayWindows.delete(window));
      return;
    }

    if (primaryWindow && !primaryWindow.isDestroyed()) return;
    primaryWindow = window;
    window.once("closed", () => {
      if (primaryWindow === window) primaryWindow = null;
      closeAllOverlays();
      if (!quitting) app.quit();
    });
  });

  app.on("before-quit", () => {
    quitting = true;
    closeAllOverlays();
  });
}

function isOverlayCandidate(window: BrowserWindow): boolean {
  if (window.isAlwaysOnTop() && !window.isFocusable()) return true;
  try {
    const url = new URL(window.webContents.getURL());
    return url.searchParams.get("overlay") === "1";
  } catch {
    return false;
  }
}

function closeAllOverlays(): void {
  for (const window of [...overlayWindows]) {
    overlayWindows.delete(window);
    if (!window.isDestroyed()) window.destroy();
  }
}

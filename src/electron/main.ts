import { app, BrowserWindow, dialog, ipcMain, screen } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { Worker } from "node:worker_threads";
import type {
  ActiveTimerEvent,
  AppSettings,
  CombatSnapshot,
  EntityAnalysis,
  InitialAppState,
  MonitorStatus,
  PowerCastEvent,
  RawEventSummary,
  TimerRule,
} from "../shared/types";
import { SettingsStore } from "./settingsStore";

type WorkerMessage =
  | { type: "status"; status: MonitorStatus }
  | { type: "snapshot"; snapshot: CombatSnapshot }
  | {
      type: "entity-detail";
      requestId: string;
      detail: EntityAnalysis | null;
    }
  | {
      type: "raw-events";
      requestId: string;
      events: RawEventSummary[];
    }
  | {
      type: "scope-entities";
      requestId: string;
      entities: EntityAnalysis[];
    }
  | { type: "cast"; cast: PowerCastEvent };

let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let logWorker: Worker | null = null;
let settingsStore: SettingsStore;
let settings: AppSettings;
let latestSnapshot: CombatSnapshot | null = null;
let latestStatus: MonitorStatus = {
  state: "idle",
  message: "Combatlog seçilmedi",
};
const lastRuleTriggers = new Map<string, number>();
const detailRequests = new Map<
  string,
  (detail: EntityAnalysis | null) => void
>();
const rawEventRequests = new Map<
  string,
  (events: RawEventSummary[]) => void
>();
const scopeEntityRequests = new Map<
  string,
  (entities: EntityAnalysis[]) => void
>();
let detailRequestSequence = 0;

app.whenReady().then(async () => {
  settingsStore = new SettingsStore(
    path.join(app.getPath("userData"), "settings.json"),
  );
  settings = await settingsStore.load();
  registerIpcHandlers();
  createMainWindow();
  createLogWorker();

  if (settings.overlayEnabled) setOverlayVisible(true);
  if (settings.logFilePath && (await fileExists(settings.logFilePath))) {
    loadLogFile(settings.logFilePath);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  logWorker?.postMessage({ type: "stop" });
  void logWorker?.terminate();
});

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1050,
    height: 680,
    minWidth: 820,
    minHeight: 560,
    backgroundColor: "#f2f2f2",
    title: "Anka Combat Analyzer",
    icon: getAppIconPath(),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  void loadRenderer(mainWindow, false);
}

function getAppIconPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "icon.png")
    : path.join(__dirname, "..", "build", "icon.png");
}

function createOverlayWindow(): BrowserWindow {
  if (overlayWindow && !overlayWindow.isDestroyed()) return overlayWindow;
  const workArea = screen.getPrimaryDisplay().workArea;
  overlayWindow = new BrowserWindow({
    width: 380,
    height: 330,
    x: workArea.x + workArea.width - 400,
    y: workArea.y + 28,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  overlayWindow.setAlwaysOnTop(true, "screen-saver");
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  overlayWindow.on("closed", () => {
    overlayWindow = null;
  });
  void loadRenderer(overlayWindow, true);
  return overlayWindow;
}

async function loadRenderer(
  window: BrowserWindow,
  overlay: boolean,
): Promise<void> {
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    await window.loadURL(`${devUrl}${overlay ? "?overlay=1" : ""}`);
  } else {
    await window.loadFile(path.join(__dirname, "../dist/index.html"), {
      query: overlay ? { overlay: "1" } : undefined,
    });
  }
}

function createLogWorker(): void {
  logWorker = new Worker(path.join(__dirname, "logWorker.js"));
  logWorker.on("message", (message: WorkerMessage) => {
    if (message.type === "status") {
      latestStatus = message.status;
      sendToWindows("monitor-status", latestStatus);
    } else if (message.type === "snapshot") {
      latestSnapshot = message.snapshot;
      mainWindow?.webContents.send("combat-snapshot", latestSnapshot);
    } else if (message.type === "entity-detail") {
      const resolve = detailRequests.get(message.requestId);
      detailRequests.delete(message.requestId);
      resolve?.(message.detail);
    } else if (message.type === "raw-events") {
      const resolve = rawEventRequests.get(message.requestId);
      rawEventRequests.delete(message.requestId);
      resolve?.(message.events);
    } else if (message.type === "scope-entities") {
      const resolve = scopeEntityRequests.get(message.requestId);
      scopeEntityRequests.delete(message.requestId);
      resolve?.(message.entities);
    } else if (message.type === "cast") {
      handlePowerCast(message.cast);
    }
  });
  logWorker.on("error", (error) => {
    latestStatus = {
      state: "error",
      filePath: settings.logFilePath,
      message: error instanceof Error ? error.message : String(error),
    };
    sendToWindows("monitor-status", latestStatus);
  });
}

function registerIpcHandlers(): void {
  ipcMain.handle("select-log-file", async () => {
    const options: Electron.OpenDialogOptions = {
      title: "Neverwinter Combatlog dosyasını seç",
      properties: ["openFile"],
      filters: [
        { name: "Neverwinter Combat Log", extensions: ["log"] },
        { name: "Tüm dosyalar", extensions: ["*"] },
      ],
    };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths[0]) return null;
    const filePath = result.filePaths[0];
    settings = await settingsStore.update({ logFilePath: filePath });
    loadLogFile(filePath);
    return filePath;
  });

  ipcMain.handle("save-data", async () => {
    if (!latestSnapshot) return null;
    const suggestedName = `anka-combat-${new Date()
      .toISOString()
      .replaceAll(":", "-")
      .slice(0, 19)}.json`;
    const options: Electron.SaveDialogOptions = {
      title: "Analiz verisini kaydet",
      defaultPath: suggestedName,
      filters: [{ name: "Anka Combat Data", extensions: ["json"] }],
    };
    const result = mainWindow
      ? await dialog.showSaveDialog(mainWindow, options)
      : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return null;
    await fs.writeFile(
      result.filePath,
      `${JSON.stringify(latestSnapshot, null, 2)}\n`,
      "utf8",
    );
    return result.filePath;
  });

  ipcMain.handle("clear-data", () => {
    latestSnapshot = null;
    logWorker?.postMessage({ type: "reset" });
  });
  ipcMain.handle("start-new-encounter", () => {
    logWorker?.postMessage({ type: "end-encounter" });
  });
  ipcMain.handle("end-encounter", () => {
    logWorker?.postMessage({ type: "end-encounter" });
  });
  ipcMain.handle(
    "get-entity-detail",
    (
      _event,
      scopeId: string,
      splitPetDamage: boolean,
      entityId: string,
    ) =>
      new Promise<EntityAnalysis | null>((resolve) => {
        if (!logWorker) {
          resolve(null);
          return;
        }
        const requestId = `detail-${++detailRequestSequence}`;
        detailRequests.set(requestId, resolve);
        logWorker.postMessage({
          type: "entity-detail",
          requestId,
          scopeId,
          splitPetDamage,
          entityId,
        });
        setTimeout(() => {
          const pending = detailRequests.get(requestId);
          if (!pending) return;
          detailRequests.delete(requestId);
          pending(null);
        }, 10_000);
      }),
  );
  ipcMain.handle(
    "get-raw-events",
    (_event, scopeId: string) =>
      new Promise<RawEventSummary[]>((resolve) => {
        if (!logWorker) {
          resolve([]);
          return;
        }
        const requestId = `raw-${++detailRequestSequence}`;
        rawEventRequests.set(requestId, resolve);
        logWorker.postMessage({ type: "raw-events", requestId, scopeId });
        setTimeout(() => {
          const pending = rawEventRequests.get(requestId);
          if (!pending) return;
          rawEventRequests.delete(requestId);
          pending([]);
        }, 10_000);
      }),
  );
  ipcMain.handle(
    "get-scope-entities",
    (_event, scopeId: string, splitPetDamage: boolean) =>
      new Promise<EntityAnalysis[]>((resolve) => {
        if (!logWorker) {
          resolve([]);
          return;
        }
        const requestId = `scope-${++detailRequestSequence}`;
        scopeEntityRequests.set(requestId, resolve);
        logWorker.postMessage({
          type: "scope-entities",
          requestId,
          scopeId,
          splitPetDamage,
        });
        setTimeout(() => {
          const pending = scopeEntityRequests.get(requestId);
          if (!pending) return;
          scopeEntityRequests.delete(requestId);
          pending([]);
        }, 10_000);
      }),
  );

  ipcMain.handle("get-initial-state", (): InitialAppState => ({
    settings,
    status: latestStatus,
    snapshot: latestSnapshot,
  }));
  ipcMain.handle("get-timer-rules", () => settings.timerRules);
  ipcMain.handle("save-timer-rule", async (_event, rule: TimerRule) => {
    const rules = settings.timerRules.filter((item) => item.id !== rule.id);
    rules.push(rule);
    settings = await settingsStore.update({ timerRules: rules });
    sendToWindows("timer-rules-changed", settings.timerRules);
    return settings.timerRules;
  });
  ipcMain.handle("delete-timer-rule", async (_event, ruleId: string) => {
    settings = await settingsStore.update({
      timerRules: settings.timerRules.filter((rule) => rule.id !== ruleId),
    });
    sendToWindows("timer-rules-changed", settings.timerRules);
    return settings.timerRules;
  });
  ipcMain.handle(
    "set-preferred-player",
    async (_event, playerId: string, name: string) => {
      settings = await settingsStore.update({
        preferredPlayerId: playerId,
        preferredPlayerName: name,
      });
      return settings;
    },
  );
  ipcMain.handle("toggle-overlay", async () => {
    return setOverlayVisible(!settings.overlayEnabled);
  });
  ipcMain.handle("set-overlay-enabled", async (_event, enabled: boolean) => {
    return setOverlayVisible(enabled);
  });
}

function loadLogFile(filePath: string): void {
  latestStatus = {
    state: "loading",
    filePath,
    message: "Combatlog açılıyor…",
    progress: 0,
  };
  sendToWindows("monitor-status", latestStatus);
  logWorker?.postMessage({ type: "load", filePath });
}

function handlePowerCast(cast: PowerCastEvent): void {
  const now = Date.now();
  for (const rule of settings.timerRules) {
    if (
      !rule.enabled ||
      rule.enemyId !== cast.enemyId ||
      rule.abilityId !== cast.abilityId
    ) {
      continue;
    }

    const triggerKey = `${rule.id}|${cast.enemyInstanceId}`;
    const previous = lastRuleTriggers.get(triggerKey);
    if (
      previous !== undefined &&
      cast.occurredAt - previous < rule.episodeGapSeconds * 1_000
    ) {
      continue;
    }
    lastRuleTriggers.set(triggerKey, cast.occurredAt);

    const timer: ActiveTimerEvent = {
      timerId: `${rule.id}-${now}`,
      ruleId: rule.id,
      label: rule.abilityName,
      enemyName: cast.enemyName,
      abilityName: cast.abilityName,
      durationSeconds: rule.intervalSeconds,
      warningSeconds: rule.warningSeconds,
      startedAt: now,
    };
    sendToWindows("timer-started", timer);
  }
}

async function setOverlayVisible(enabled: boolean): Promise<boolean> {
  settings = await settingsStore.update({ overlayEnabled: enabled });
  const window = createOverlayWindow();
  if (enabled) {
    window.showInactive();
  } else {
    window.hide();
  }
  return enabled;
}

function sendToWindows(channel: string, payload: unknown): void {
  mainWindow?.webContents.send(channel, payload);
  overlayWindow?.webContents.send(channel, payload);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

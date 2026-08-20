import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  net,
  screen,
  shell,
} from "electron";
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

interface GithubReleaseAsset {
  name: string;
  browser_download_url: string;
}

interface GithubRelease {
  tag_name: string;
  name: string;
  html_url: string;
  assets: GithubReleaseAsset[];
}

interface UpdateStatus {
  state: "current" | "available" | "error";
  currentVersion: string;
  latestVersion?: string;
  releaseName?: string;
  releaseUrl?: string;
  downloadUrl?: string;
  assetName?: string;
  message: string;
}

interface UpdateDownloadResult {
  success: boolean;
  filePath?: string;
  message: string;
}

const UPDATE_REPOSITORY = "brkeaslan5561/anka-combat-analyzer";
const UPDATE_CACHE_MS = 5 * 60 * 1_000;

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
let cachedUpdateStatus: UpdateStatus | null = null;
let cachedUpdateCheckedAt = 0;
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
  const rememberedLog = await resolveRememberedLogPath();
  if (rememberedLog) {
    const directory = path.dirname(rememberedLog);
    if (
      settings.logFilePath !== rememberedLog ||
      settings.logDirectoryPath !== directory
    ) {
      settings = await settingsStore.update({
        logFilePath: rememberedLog,
        logDirectoryPath: directory,
      });
    }
    loadLogFile(rememberedLog);
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
    frame: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("maximize", () => {
    mainWindow?.webContents.send("window-maximized-changed", true);
  });
  mainWindow.on("unmaximize", () => {
    mainWindow?.webContents.send("window-maximized-changed", false);
  });
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
      defaultPath:
        settings.logDirectoryPath ??
        (settings.logFilePath ? path.dirname(settings.logFilePath) : undefined),
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
    settings = await settingsStore.update({
      logFilePath: filePath,
      logDirectoryPath: path.dirname(filePath),
    });
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
    logWorker?.postMessage({ type: "start-new-encounter" });
  });
  ipcMain.handle("start-new-run", () => {
    logWorker?.postMessage({ type: "start-new-run" });
  });
  ipcMain.handle("end-encounter", () => {
    logWorker?.postMessage({ type: "end-encounter" });
  });
  ipcMain.handle("mark-encounter-fail", () => {
    logWorker?.postMessage({ type: "mark-encounter-fail" });
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

  ipcMain.handle("window-minimize", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });
  ipcMain.handle("window-toggle-maximize", (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return false;
    if (window.isMaximized()) window.unmaximize();
    else window.maximize();
    return window.isMaximized();
  });
  ipcMain.handle("window-is-maximized", (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false;
  });
  ipcMain.handle("window-close", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });

  ipcMain.handle("get-update-status", async () => checkForUpdates());
  ipcMain.handle("download-update", async () => downloadLatestUpdate());
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

async function resolveRememberedLogPath(): Promise<string | null> {
  if (settings.logFilePath && (await fileExists(settings.logFilePath))) {
    return settings.logFilePath;
  }

  const directories = [
    settings.logDirectoryPath,
    settings.logFilePath ? path.dirname(settings.logFilePath) : undefined,
    ...commonNeverwinterLogDirectories(),
  ].filter((value): value is string => Boolean(value));

  for (const directory of [...new Set(directories)]) {
    const logFile = await findLatestCombatLog(directory);
    if (logFile) return logFile;
  }
  return null;
}

function commonNeverwinterLogDirectories(): string[] {
  const programFiles = process.env.ProgramFiles;
  const programFilesX86 = process.env["ProgramFiles(x86)"];
  const userProfile = process.env.USERPROFILE;
  return [
    programFilesX86
      ? path.join(
          programFilesX86,
          "Steam",
          "steamapps",
          "common",
          "Cryptic Studios",
          "Neverwinter",
          "Live",
          "logs",
          "GameClient",
        )
      : undefined,
    programFilesX86
      ? path.join(
          programFilesX86,
          "Neverwinter_en",
          "Neverwinter",
          "Live",
          "logs",
          "GameClient",
        )
      : undefined,
    programFiles
      ? path.join(
          programFiles,
          "Neverwinter",
          "Neverwinter",
          "Live",
          "logs",
          "GameClient",
        )
      : undefined,
    userProfile
      ? path.join(
          userProfile,
          "Games",
          "Neverwinter",
          "Live",
          "logs",
          "GameClient",
        )
      : undefined,
  ].filter((value): value is string => Boolean(value));
}

async function findLatestCombatLog(directory: string): Promise<string | null> {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const logFiles = entries.filter(
      (entry) => entry.isFile() && entry.name.toLocaleLowerCase("en-US").endsWith(".log"),
    );
    if (logFiles.length === 0) return null;

    const ranked = await Promise.all(
      logFiles.map(async (entry) => {
        const filePath = path.join(directory, entry.name);
        const stat = await fs.stat(filePath);
        const combatPriority = /combat/i.test(entry.name) ? 1 : 0;
        return { filePath, modifiedAt: stat.mtimeMs, combatPriority };
      }),
    );
    ranked.sort(
      (left, right) =>
        right.combatPriority - left.combatPriority ||
        right.modifiedAt - left.modifiedAt,
    );
    return ranked[0]?.filePath ?? null;
  } catch {
    return null;
  }
}

async function checkForUpdates(force = false): Promise<UpdateStatus> {
  const now = Date.now();
  if (
    !force &&
    cachedUpdateStatus &&
    now - cachedUpdateCheckedAt < UPDATE_CACHE_MS
  ) {
    return cachedUpdateStatus;
  }

  const currentVersion = app.getVersion();
  try {
    const response = await net.fetch(
      `https://api.github.com/repos/${UPDATE_REPOSITORY}/releases/latest`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "Anka-Combat-Analyzer",
        },
      },
    );
    if (!response.ok) {
      throw new Error(`GitHub update check failed (${response.status})`);
    }
    const release = (await response.json()) as GithubRelease;
    const latestVersion = normalizeVersion(release.tag_name);
    const installer =
      release.assets.find(
        (asset) =>
          /setup/i.test(asset.name) && asset.name.toLowerCase().endsWith(".exe"),
      ) ?? release.assets.find((asset) => asset.name.toLowerCase().endsWith(".exe"));
    const available = compareVersions(latestVersion, currentVersion) > 0;
    cachedUpdateStatus = {
      state: available ? "available" : "current",
      currentVersion,
      latestVersion,
      releaseName: release.name,
      releaseUrl: release.html_url,
      downloadUrl: installer?.browser_download_url,
      assetName: installer?.name,
      message: available
        ? `v${latestVersion} hazır`
        : `v${currentVersion} güncel`,
    };
    cachedUpdateCheckedAt = now;
    return cachedUpdateStatus;
  } catch (error) {
    cachedUpdateStatus = {
      state: "error",
      currentVersion,
      message: error instanceof Error ? error.message : String(error),
    };
    cachedUpdateCheckedAt = now;
    return cachedUpdateStatus;
  }
}

async function downloadLatestUpdate(): Promise<UpdateDownloadResult> {
  const update = await checkForUpdates(true);
  if (update.state === "error") {
    return { success: false, message: update.message };
  }
  if (update.state !== "available") {
    return { success: false, message: "Uygulama zaten güncel." };
  }
  if (!update.downloadUrl || !update.assetName) {
    if (update.releaseUrl) await shell.openExternal(update.releaseUrl);
    return {
      success: false,
      message: "Kurulum dosyası bulunamadı; release sayfası açıldı.",
    };
  }

  try {
    const response = await net.fetch(update.downloadUrl, {
      headers: { "User-Agent": "Anka-Combat-Analyzer" },
    });
    if (!response.ok) {
      throw new Error(`Update download failed (${response.status})`);
    }
    const destination = path.join(app.getPath("downloads"), update.assetName);
    const bytes = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(destination, bytes);
    const openError = await shell.openPath(destination);
    if (openError) {
      return {
        success: true,
        filePath: destination,
        message: `Güncelleme indirildi: ${destination}`,
      };
    }
    return {
      success: true,
      filePath: destination,
      message: "Güncelleme indirildi ve kurulum başlatıldı.",
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/i, "");
}

function compareVersions(left: string, right: string): number {
  const leftParts = normalizeVersion(left).split(".").map(Number);
  const rightParts = normalizeVersion(right).split(".").map(Number);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const leftValue = Number.isFinite(leftParts[index]) ? leftParts[index] : 0;
    const rightValue = Number.isFinite(rightParts[index]) ? rightParts[index] : 0;
    if (leftValue !== rightValue) return leftValue > rightValue ? 1 : -1;
  }
  return 0;
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

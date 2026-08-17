import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type {
  ActiveTimerEvent,
  AnalyzerApi,
  CombatSnapshot,
  DisplayPreferences,
  DisplaySettingsPatch,
  MonitorStatus,
  TimerRule,
} from "../shared/types";

function subscribe<T>(
  channel: string,
  callback: (payload: T) => void,
): () => void {
  const listener = (_event: IpcRendererEvent, payload: T) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: AnalyzerApi = {
  selectLogFile: () => ipcRenderer.invoke("select-log-file"),
  saveData: () => ipcRenderer.invoke("save-data"),
  clearData: () => ipcRenderer.invoke("clear-data"),
  startNewEncounter: () => ipcRenderer.invoke("start-new-encounter"),
  endEncounter: () => ipcRenderer.invoke("end-encounter"),
  markEncounterFail: () => ipcRenderer.invoke("mark-encounter-fail"),
  getEntityDetail: (
    scopeId: string,
    splitPetDamage: boolean,
    entityId: string,
  ) =>
    ipcRenderer.invoke(
      "get-entity-detail",
      scopeId,
      splitPetDamage,
      entityId,
    ),
  getRawEvents: (scopeId: string) =>
    ipcRenderer.invoke("get-raw-events", scopeId),
  getScopeEntities: (scopeId: string, splitPetDamage: boolean) =>
    ipcRenderer.invoke("get-scope-entities", scopeId, splitPetDamage),
  getInitialState: () => ipcRenderer.invoke("get-initial-state"),
  getTimerRules: () => ipcRenderer.invoke("get-timer-rules"),
  saveTimerRule: (rule: TimerRule) =>
    ipcRenderer.invoke("save-timer-rule", rule),
  deleteTimerRule: (ruleId: string) =>
    ipcRenderer.invoke("delete-timer-rule", ruleId),
  setPreferredPlayer: (playerId: string, name: string) =>
    ipcRenderer.invoke("set-preferred-player", playerId, name),
  toggleOverlay: () => ipcRenderer.invoke("toggle-overlay"),
  setOverlayEnabled: (enabled: boolean) =>
    ipcRenderer.invoke("set-overlay-enabled", enabled),
  getDisplayPreferences: () => ipcRenderer.invoke("get-display-preferences"),
  updateDisplaySettings: (patch: DisplaySettingsPatch) =>
    ipcRenderer.invoke("update-display-settings", patch),
  beginOverlayMove: () => ipcRenderer.invoke("begin-overlay-move"),
  finishOverlayMove: () => ipcRenderer.invoke("finish-overlay-move"),
  resetOverlayPosition: () => ipcRenderer.invoke("reset-overlay-position"),
  getUpdateStatus: () => ipcRenderer.invoke("get-update-status"),
  // Keep the public API stable, but route updates through the new temp/background
  // installer so Setup.exe is no longer written into the user's Downloads folder.
  downloadUpdate: () => ipcRenderer.invoke("install-latest-update"),
  minimizeWindow: () => ipcRenderer.invoke("window-minimize"),
  toggleMaximizeWindow: () => ipcRenderer.invoke("window-toggle-maximize"),
  isWindowMaximized: () => ipcRenderer.invoke("window-is-maximized"),
  closeWindow: () => ipcRenderer.invoke("window-close"),
  onWindowMaximizedChanged: (callback: (maximized: boolean) => void) =>
    subscribe("window-maximized-changed", callback),
  onDisplayPreferencesChanged: (
    callback: (settings: DisplayPreferences) => void,
  ) => subscribe("display-preferences-changed", callback),
  onOverlayMoveModeChanged: (callback: (moving: boolean) => void) =>
    subscribe("overlay-move-mode-changed", callback),
  onSnapshot: (callback: (snapshot: CombatSnapshot) => void) =>
    subscribe("combat-snapshot", callback),
  onStatus: (callback: (status: MonitorStatus) => void) =>
    subscribe("monitor-status", callback),
  onTimerStarted: (callback: (event: ActiveTimerEvent) => void) =>
    subscribe("timer-started", callback),
};

contextBridge.exposeInMainWorld("analyzer", api);

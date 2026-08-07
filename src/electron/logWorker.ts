import fs from "node:fs/promises";
import { StringDecoder } from "node:string_decoder";
import { parentPort } from "node:worker_threads";
import { CombatAnalysisEngine } from "../core/analysisEngine";
import {
  isHostileCombatEvent,
  parseCombatLogLine,
} from "../core/combatLogParser";
import type {
  CombatSnapshot,
  EntityAnalysis,
  MonitorStatus,
  PowerCastEvent,
  RawEventSummary,
} from "../shared/types";

type IncomingMessage =
  | { type: "load"; filePath: string }
  | { type: "reset" }
  | { type: "start-new-encounter" }
  | { type: "end-encounter" }
  | { type: "mark-encounter-fail" }
  | {
      type: "entity-detail";
      requestId: string;
      scopeId: string;
      splitPetDamage: boolean;
      entityId: string;
    }
  | { type: "raw-events"; requestId: string; scopeId: string }
  | {
      type: "scope-entities";
      requestId: string;
      scopeId: string;
      splitPetDamage: boolean;
    }
  | { type: "stop" };

type OutgoingMessage =
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

const LATEST_SESSION_GAP_MS = 20 * 60 * 1_000;
const MAX_LATEST_SESSION_MS = 3 * 60 * 60 * 1_000;

if (!parentPort) {
  throw new Error("Log worker yalnızca worker thread içinde çalıştırılabilir.");
}

let engine = new CombatAnalysisEngine();
let currentFilePath: string | null = null;
let byteOffset = 0;
let pendingText = "";
let decoder = new StringDecoder("utf8");
let pollTimer: NodeJS.Timeout | null = null;
let polling = false;
let generation = 0;
let lastCadenceRefresh = 0;

parentPort.on("message", (message: IncomingMessage) => {
  if (message.type === "load") {
    void loadFile(message.filePath);
  } else if (message.type === "reset") {
    void clearAndTail();
  } else if (message.type === "start-new-encounter") {
    engine.startNewEncounter();
    if (currentFilePath) postSnapshot(engine.snapshot(currentFilePath, false));
  } else if (message.type === "end-encounter") {
    engine.endEncounter();
    if (currentFilePath) postSnapshot(engine.snapshot(currentFilePath, false));
  } else if (message.type === "mark-encounter-fail") {
    engine.markEncounterFail();
    if (currentFilePath) postSnapshot(engine.snapshot(currentFilePath, false));
  } else if (message.type === "entity-detail") {
    post({
      type: "entity-detail",
      requestId: message.requestId,
      detail: engine.getEntityDetail(
        message.scopeId,
        message.splitPetDamage,
        message.entityId,
      ),
    });
  } else if (message.type === "raw-events") {
    post({
      type: "raw-events",
      requestId: message.requestId,
      events: engine.getRawEvents(message.scopeId),
    });
  } else if (message.type === "scope-entities") {
    post({
      type: "scope-entities",
      requestId: message.requestId,
      entities: engine.getScopeEntities(
        message.scopeId,
        message.splitPetDamage,
      ),
    });
  } else if (message.type === "stop") {
    stopPolling();
  }
});

async function loadFile(filePath: string): Promise<void> {
  const activeGeneration = ++generation;
  stopPolling();
  currentFilePath = filePath;
  engine = new CombatAnalysisEngine();
  byteOffset = 0;
  pendingText = "";
  decoder = new StringDecoder("utf8");
  lastCadenceRefresh = 0;

  postStatus({
    state: "loading",
    filePath,
    message: "Combatlog içindeki son oturum bulunuyor…",
    progress: 0,
  });

  try {
    const stat = await fs.stat(filePath);
    const initialSize = stat.size;
    const buffer =
      initialSize > 0
        ? await readRange(filePath, 0, initialSize)
        : Buffer.alloc(0);
    if (activeGeneration !== generation) return;

    const text = buffer.toString("utf8").replace(/^\uFEFF/, "");
    const hasCompleteLastLine = text.endsWith("\n");
    const allLines = text.split(/\r?\n/);
    if (!hasCompleteLastLine) {
      pendingText = allLines.pop() ?? "";
    } else if (allLines.at(-1) === "") {
      allLines.pop();
    }

    const sessionStart = findLatestSessionStart(allLines);
    const lines = allLines.slice(sessionStart);

    postStatus({
      state: "loading",
      filePath,
      message:
        sessionStart > 0
          ? "Son oyun/zindan oturumu analiz ediliyor…"
          : "Combatlog analiz ediliyor…",
      progress: 0,
    });

    for (let index = 0; index < lines.length; index += 1) {
      if (lines[index]) engine.ingestLine(lines[index]);
      if (index > 0 && index % 20_000 === 0) {
        postStatus({
          state: "loading",
          filePath,
          message: `${index.toLocaleString("tr-TR")} satır işlendi…`,
          progress: lines.length > 0 ? index / lines.length : 1,
        });
        await yieldToEventLoop();
        if (activeGeneration !== generation) return;
      }
    }

    byteOffset = initialSize;
    lastCadenceRefresh = Date.now();
    postSnapshot(engine.snapshot(filePath, true));
    postStatus({
      state: "live",
      filePath,
      message:
        sessionStart > 0
          ? "Son oturum yüklendi · canlı takip açık"
          : "Canlı takip açık",
      progress: 1,
    });
    startPolling(activeGeneration);
  } catch (error) {
    postStatus({
      state: "error",
      filePath,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function clearAndTail(): Promise<void> {
  const activeGeneration = ++generation;
  stopPolling();
  engine = new CombatAnalysisEngine();
  pendingText = "";
  decoder = new StringDecoder("utf8");
  lastCadenceRefresh = Date.now();

  if (!currentFilePath) {
    byteOffset = 0;
    return;
  }

  try {
    const stat = await fs.stat(currentFilePath);
    byteOffset = stat.size;
    postSnapshot(engine.snapshot(currentFilePath, true));
    postStatus({
      state: "live",
      filePath: currentFilePath,
      message: "Temizlendi · bundan sonraki combat bekleniyor",
      progress: 1,
    });
    startPolling(activeGeneration);
  } catch (error) {
    postStatus({
      state: "error",
      filePath: currentFilePath,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function findLatestSessionStart(lines: string[]): number {
  let latestHostileAt: number | null = null;
  let nextHostileAt: number | null = null;
  let latestHostileIndex = -1;

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!line) continue;
    const parsed = parseCombatLogLine(line, index + 1);
    if (!parsed.ok || !isHostileCombatEvent(parsed.event)) continue;

    const occurredAt = parsed.event.timestamp;
    if (latestHostileAt === null) {
      latestHostileAt = occurredAt;
      nextHostileAt = occurredAt;
      latestHostileIndex = index;
      continue;
    }

    if (
      (nextHostileAt !== null && nextHostileAt - occurredAt > LATEST_SESSION_GAP_MS) ||
      latestHostileAt - occurredAt > MAX_LATEST_SESSION_MS
    ) {
      return index + 1;
    }

    nextHostileAt = occurredAt;
  }

  return latestHostileIndex >= 0 ? 0 : lines.length;
}

function startPolling(activeGeneration: number): void {
  stopPolling();
  pollTimer = setInterval(() => {
    void pollForChanges(activeGeneration);
  }, 500);
}

async function pollForChanges(activeGeneration: number): Promise<void> {
  if (
    polling ||
    activeGeneration !== generation ||
    currentFilePath === null
  ) {
    return;
  }
  polling = true;

  try {
    const stat = await fs.stat(currentFilePath);
    if (stat.size < byteOffset) {
      await loadFile(currentFilePath);
      return;
    }
    if (stat.size === byteOffset) return;

    const buffer = await readRange(
      currentFilePath,
      byteOffset,
      stat.size - byteOffset,
    );
    byteOffset = stat.size;
    pendingText += decoder.write(buffer);
    const lines = pendingText.split(/\r?\n/);
    pendingText = lines.pop() ?? "";

    for (const line of lines) {
      if (!line) continue;
      const cast = engine.ingestLine(line);
      if (cast) postCast(cast);
    }

    const refreshCadence = Date.now() - lastCadenceRefresh >= 5_000;
    if (refreshCadence) lastCadenceRefresh = Date.now();
    postSnapshot(engine.snapshot(currentFilePath, refreshCadence));
  } catch (error) {
    postStatus({
      state: "error",
      filePath: currentFilePath,
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    polling = false;
  }
}

async function readRange(
  filePath: string,
  start: number,
  length: number,
): Promise<Buffer> {
  if (length <= 0) return Buffer.alloc(0);
  const handle = await fs.open(filePath, "r");
  try {
    const buffer = Buffer.allocUnsafe(length);
    let written = 0;
    while (written < length) {
      const { bytesRead } = await handle.read(
        buffer,
        written,
        length - written,
        start + written,
      );
      if (bytesRead === 0) break;
      written += bytesRead;
    }
    return buffer.subarray(0, written);
  } finally {
    await handle.close();
  }
}

function stopPolling(): void {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

function postStatus(status: MonitorStatus): void {
  post({ type: "status", status });
}

function postSnapshot(snapshot: CombatSnapshot): void {
  post({ type: "snapshot", snapshot });
}

function postCast(cast: PowerCastEvent): void {
  post({ type: "cast", cast });
}

function post(message: OutgoingMessage): void {
  parentPort?.postMessage(message);
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

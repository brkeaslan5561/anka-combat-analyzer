import fs from "node:fs/promises";
import { StringDecoder } from "node:string_decoder";
import { parentPort } from "node:worker_threads";
import { CombatAnalysisEngine } from "../core/analysisEngine";
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
    engine.reset();
    if (currentFilePath) postSnapshot(engine.snapshot(currentFilePath, true));
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
    message: "Combatlog analiz ediliyor…",
    progress: 0,
  });

  try {
    const stat = await fs.stat(filePath);
    const initialSize = stat.size;
    const buffer = initialSize > 0 ? await readRange(filePath, 0, initialSize) : Buffer.alloc(0);
    if (activeGeneration !== generation) return;

    const text = buffer.toString("utf8").replace(/^\uFEFF/, "");
    const hasCompleteLastLine = text.endsWith("\n");
    const lines = text.split(/\r?\n/);
    if (!hasCompleteLastLine) {
      pendingText = lines.pop() ?? "";
    } else if (lines.at(-1) === "") {
      lines.pop();
    }

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
      message: "Canlı takip açık",
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

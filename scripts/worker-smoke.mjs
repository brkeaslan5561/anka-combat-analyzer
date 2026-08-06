import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Worker } from "node:worker_threads";

const directory = await fs.mkdtemp(path.join(os.tmpdir(), "anka-worker-smoke-"));
const logPath = path.join(directory, "Combatlog.Log");
const firstLine =
  "26:08:02:22:00:00.0::Gzemnid,C[17 Trial_Beholder_Gzemnid],,*,opop,P[518872298@18657381 opop@test#0001],Withering Ray,Pn.Uhk6en1,Physical,,100,100\r\n";
const appendedLine =
  "26:08:02:22:00:24.0::Gzemnid,C[17 Trial_Beholder_Gzemnid],,*,opop,P[518872298@18657381 opop@test#0001],Withering Ray,Pn.Uhk6en1,Physical,,100,100\r\n";

await fs.writeFile(logPath, firstLine, "utf8");
const worker = new Worker(
  path.resolve("dist-electron/logWorker.js"),
);

let initialSnapshotSeen = false;
let liveCastSeen = false;
let entityDetailSeen = false;
let scopeEntitiesSeen = false;
let rawEventsSeen = false;
let finishing = false;
let successLogged = false;
const timeout = setTimeout(() => {
  console.error("Worker smoke testi zaman aşımına uğradı.");
  process.exitCode = 1;
  void finish();
}, 8_000);

worker.on("message", async (message) => {
  if (message.type === "snapshot" && !initialSnapshotSeen) {
    initialSnapshotSeen = true;
    worker.postMessage({
      type: "entity-detail",
      requestId: "detail-smoke",
      scopeId: "all",
      splitPetDamage: false,
      entityId: "player:518872298@18657381",
    });
    worker.postMessage({
      type: "scope-entities",
      requestId: "scope-smoke",
      scopeId: "all",
      splitPetDamage: false,
    });
    worker.postMessage({
      type: "raw-events",
      requestId: "raw-smoke",
      scopeId: "all",
    });
    await fs.appendFile(logPath, appendedLine, "utf8");
  }
  if (
    message.type === "entity-detail" &&
    message.requestId === "detail-smoke" &&
    message.detail?.incomingDamage === 100
  ) {
    entityDetailSeen = true;
  }
  if (
    message.type === "scope-entities" &&
    message.requestId === "scope-smoke" &&
    message.entities.some((entity) => entity.baseName === "opop")
  ) {
    scopeEntitiesSeen = true;
  }
  if (
    message.type === "raw-events" &&
    message.requestId === "raw-smoke" &&
    message.events.length === 1
  ) {
    rawEventsSeen = true;
  }
  if (
    message.type === "cast" &&
    message.cast.abilityId === "Pn.Uhk6en1"
  ) {
    liveCastSeen = true;
  }
  if (
    liveCastSeen &&
    entityDetailSeen &&
    scopeEntitiesSeen &&
    rawEventsSeen &&
    !successLogged
  ) {
    successLogged = true;
    console.log(
      "Canlı takip, güç tetiklemesi ve isteğe bağlı analiz sorguları başarılı.",
    );
    await finish();
  }
});

worker.on("error", async (error) => {
  console.error(error);
  process.exitCode = 1;
  await finish();
});

worker.postMessage({ type: "load", filePath: logPath });

async function finish() {
  if (finishing) return;
  finishing = true;
  clearTimeout(timeout);
  await worker.terminate();
  await fs.rm(directory, { recursive: true, force: true });
  if (
    !initialSnapshotSeen ||
    !liveCastSeen ||
    !entityDetailSeen ||
    !scopeEntitiesSeen ||
    !rawEventsSeen
  ) {
    process.exitCode = 1;
  }
}

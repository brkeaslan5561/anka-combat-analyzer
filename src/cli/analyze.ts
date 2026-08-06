import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { CombatAnalysisEngine } from "../core/analysisEngine";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const fileArgument = args.find((value) => !value.startsWith("--"));
  const playerIndex = args.indexOf("--player");
  const playerName = playerIndex >= 0 ? args[playerIndex + 1] : undefined;
  const asJson = args.includes("--json");

  if (!fileArgument) {
    throw new Error(
      "Kullanım: npm run analyze -- <Combatlog.Log> [--player opop] [--json]",
    );
  }

  const filePath = path.resolve(fileArgument);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Dosya bulunamadı: ${filePath}`);
  }

  const engine = new CombatAnalysisEngine();
  const input = fs.createReadStream(filePath, { encoding: "utf8" });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    if (line.length > 0) engine.ingestLine(line);
  }

  const snapshot = engine.snapshot(filePath);
  if (asJson) {
    process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
    return;
  }

  console.log(`Dosya: ${snapshot.filePath}`);
  console.log(
    `Satır: ${snapshot.parsedLines.toLocaleString("tr-TR")} | Hata: ${snapshot.parseErrors}`,
  );
  console.log(
    `Oyuncu: ${snapshot.players.length} | Savaş bölümü: ${snapshot.encounters.length} | Aktif süre: ${snapshot.activeCombatSeconds.toFixed(1)} sn`,
  );

  console.log("\nHasar sıralaması");
  for (const [index, player] of snapshot.players.entries()) {
    console.log(
      `${index + 1}. ${player.name.padEnd(20)} ${formatDamage(player.totalDamage).padStart(10)}  combat ${formatDamage(player.combatDps).padStart(9)}/sn  enc ${formatDamage(player.encDps).padStart(9)}/sn  ${(player.share * 100).toFixed(1)}%`,
    );
  }

  if (playerName) {
    const selected = snapshot.players.find(
      (player) => player.name.toLocaleLowerCase("tr-TR") === playerName.toLocaleLowerCase("tr-TR"),
    );
    if (!selected) {
      console.log(`\nOyuncu bulunamadı: ${playerName}`);
    } else {
      console.log(`\n${selected.name} güç dağılımı`);
      for (const ability of selected.abilities.slice(0, 20)) {
        console.log(
          `${ability.name.padEnd(25)} ${formatDamage(ability.damage).padStart(10)}  ${(ability.share * 100).toFixed(2).padStart(6)}%  ${ability.hits.toString().padStart(5)} vuruş`,
        );
      }
    }
  }

  console.log("\nDüzenli düşman gücü adayları");
  const candidates = snapshot.enemyPowers.filter(({ cadence }) =>
    ["high", "medium"].includes(cadence.classification),
  );
  for (const power of candidates.slice(0, 30)) {
    console.log(
      `${power.enemyName.padEnd(22)} ${power.abilityName.padEnd(25)} ${power.cadence.estimatedIntervalSeconds?.toFixed(1).padStart(5)} sn  güven ${power.cadence.confidence}% (${power.cadence.classification})`,
    );
  }
}

function formatDamage(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(0);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});

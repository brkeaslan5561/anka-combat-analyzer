import { describe, expect, it } from "vitest";
import { CombatAnalysisEngine } from "../src/core/analysisEngine";
import { createAggregateScopeId } from "../src/shared/analysisScope";

function playerHit(
  elapsedSeconds: number,
  targetName: string,
  targetRaw: string,
  amount: number,
): string {
  const base = new Date(2026, 7, 18, 10, 0, 0, 0);
  base.setSeconds(base.getSeconds() + elapsedSeconds);
  const stamp = [
    String(base.getFullYear() % 100).padStart(2, "0"),
    String(base.getMonth() + 1).padStart(2, "0"),
    String(base.getDate()).padStart(2, "0"),
    String(base.getHours()).padStart(2, "0"),
    String(base.getMinutes()).padStart(2, "0"),
    String(base.getSeconds()).padStart(2, "0"),
  ].join(":");
  return `${stamp}.0::Anka,P[1@2 Anka@test],,*,${targetName},${targetRaw},Strike,Pn.hit,Physical,,${amount},${amount}`;
}

describe("run grouping and aggregate encounter scopes", () => {
  it("merges only explicitly selected encounters with summed encounter duration", () => {
    const engine = new CombatAnalysisEngine();
    engine.ingestLine(playerHit(0, "Pack One", "C[10 M31_Trial_Mob_One]", 100));
    engine.ingestLine(playerHit(5, "Pack One", "C[10 M31_Trial_Mob_One]", 100));
    engine.ingestLine(playerHit(20, "Pack Two", "C[20 M31_Trial_Mob_Two]", 300));
    engine.ingestLine(playerHit(25, "Pack Two", "C[20 M31_Trial_Mob_Two]", 300));

    const snapshot = engine.snapshot("fixture.log");
    const scopeId = createAggregateScopeId(
      snapshot.encounters.map((encounter) => encounter.id),
      "sum",
    );
    const player = engine
      .getScopeEntities(scopeId, false)
      .find((entity) => entity.kind === "player");
    const detail = player
      ? engine.getEntityDetail(scopeId, false, player.entityId)
      : null;

    expect(snapshot.encounters).toHaveLength(2);
    expect(player?.outgoingDamage).toBe(800);
    expect(player?.activeSeconds).toBe(10);
    expect(player?.combatDps).toBe(80);
    expect(player?.encDps).toBe(80);
    expect(detail?.individualOutHits).toHaveLength(4);

    const visibleOnlyScope = createAggregateScopeId(
      [snapshot.encounters[1]!.id],
      "elapsed",
    );
    const visibleOnlyPlayer = engine
      .getScopeEntities(visibleOnlyScope, false)
      .find((entity) => entity.kind === "player");
    expect(visibleOnlyPlayer?.outgoingDamage).toBe(600);
  });

  it("creates run parents for reliable content changes and manual run boundaries", () => {
    const engine = new CombatAnalysisEngine();
    engine.ingestLine(playerHit(0, "Trial Pack", "C[10 M31_Trial_Mob]", 100));
    engine.ingestLine(playerHit(15, "Dungeon Pack", "C[20 M32_Dungeon_Mob]", 100));

    let snapshot = engine.snapshot("fixture.log");
    expect(snapshot.runs).toHaveLength(2);
    expect(snapshot.runs[0]?.contentKey).toBe("M31 Trial");
    expect(snapshot.runs[1]?.contentKey).toBe("M32 Dungeon");
    expect(snapshot.runs[0]?.encounterIds).toEqual([snapshot.encounters[0]?.id]);

    engine.startNewRun();
    snapshot = engine.snapshot("fixture.log");
    expect(snapshot.runs).toHaveLength(3);
    expect(snapshot.runs[2]?.active).toBe(true);
  });

  it("starts a new run after ten minutes without combat", () => {
    const engine = new CombatAnalysisEngine();
    engine.ingestLine(playerHit(0, "First", "C[10 M31_Trial_Mob]", 100));
    engine.ingestLine(playerHit(601, "Again", "C[20 M31_Trial_Mob]", 100));

    const snapshot = engine.snapshot("fixture.log");
    expect(snapshot.encounters).toHaveLength(2);
    expect(snapshot.runs).toHaveLength(2);
    expect(snapshot.activeCombatSeconds).toBe(1);
  });
});

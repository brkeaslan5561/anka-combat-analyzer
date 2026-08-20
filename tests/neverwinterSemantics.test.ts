import { describe, expect, it } from "vitest";
import { CombatAnalysisEngine } from "../src/core/analysisEngine";

describe("Neverwinter combat log semantics", () => {
  it("records zero-magnitude HitPoints Kill lines as deaths", () => {
    const engine = new CombatAnalysisEngine();
    engine.ingestLine(
      "26:08:18:12:00:00.0::Enemy,C[7 M31_Trial_Boss],,*,Anka,P[1@2 Anka@test],Strike,Pn.hit,Physical,,10,10",
    );
    engine.ingestLine(
      "26:08:18:12:00:01.0::Enemy,C[7 M31_Trial_Boss],,*,Anka,P[1@2 Anka@test],Kill,Pn.Hemuxg,HitPoints,Kill,0,0",
    );

    const snapshot = engine.snapshot("fixture.log");
    expect(snapshot.deaths).toHaveLength(1);
    expect(snapshot.deaths[0]?.victimName).toBe("Anka");
    expect(snapshot.encounters[0]?.deaths).toHaveLength(1);
  });

  it("does not count ShowPowerDisplayName control records as damage", () => {
    const engine = new CombatAnalysisEngine();
    engine.ingestLine(
      "26:08:18:12:01:00.0::Anka,P[1@2 Anka@test],,*,Enemy,C[7 M31_Trial_Boss],Visual,Pn.visual,Physical,ShowPowerDisplayName,999,999",
    );
    expect(engine.snapshot("fixture.log").players).toHaveLength(0);
  });

  it("attributes Knight's Valor redirected damage to the creature source", () => {
    const engine = new CombatAnalysisEngine();
    engine.ingestLine(
      "26:08:18:12:02:00.0::Tank,P[1@2 Tank@test],Enemy,C[7 M31_Trial_Boss],Tank,P[1@2 Tank@test],Knight's Valor,Pn.Wypyjw1,Physical,,100,200",
    );
    const snapshot = engine.snapshot("fixture.log");
    const tank = snapshot.entities.find((entity) => entity.baseName === "Tank");
    const enemy = snapshot.entities.find((entity) => entity.baseName === "Enemy");
    expect(tank?.outgoingDamage).toBe(0);
    expect(tank?.incomingDamage).toBe(100);
    expect(enemy?.outgoingDamage).toBe(100);
  });

  it("uses healing activity for combatHPS without changing combatDPS activity", () => {
    const engine = new CombatAnalysisEngine();
    engine.ingestLine(
      "26:08:18:12:03:00.0::Anka,P[1@2 Anka@test],,*,Enemy,C[7 M31_Trial_Boss],Strike,Pn.hit,Physical,,100,100",
    );
    engine.ingestLine(
      "26:08:18:12:03:05.0::Anka,P[1@2 Anka@test],,*,Enemy,C[7 M31_Trial_Boss],Strike,Pn.hit,Physical,,100,100",
    );
    engine.ingestLine(
      "26:08:18:12:03:00.0::Anka,P[1@2 Anka@test],,*,Anka,P[1@2 Anka@test],Heal,Pn.heal,HitPoints,,-50,-50",
    );
    engine.ingestLine(
      "26:08:18:12:03:10.0::Anka,P[1@2 Anka@test],,*,Anka,P[1@2 Anka@test],Heal,Pn.heal,HitPoints,,-50,-50",
    );

    const player = engine.snapshot("fixture.log").entities.find(
      (entity) => entity.kind === "player",
    );
    expect(player?.activeSeconds).toBe(5);
    expect(player?.combatDps).toBe(40);
    expect(player?.combatHps).toBe(10);
  });

  it("keeps out-of-combat healing out of All Encounters", () => {
    const engine = new CombatAnalysisEngine();
    engine.ingestLine(
      "26:08:18:12:05:00.0::Anka,P[1@2 Anka@test],,*,Enemy,C[7 M31_Trial_Boss],Strike,Pn.hit,Physical,,100,100",
    );
    engine.ingestLine(
      "26:08:18:12:05:20.0::Anka,P[1@2 Anka@test],,*,Anka,P[1@2 Anka@test],Campfire,Pn.campfire,HitPoints,,-500,-500",
    );

    const player = engine.snapshot("fixture.log").entities.find(
      (entity) => entity.kind === "player",
    );
    expect(player?.outgoingDamage).toBe(100);
    expect(player?.outgoingHealing).toBe(0);
  });

  it("treats shield damage as hostile mitigation that can start an encounter", () => {
    const engine = new CombatAnalysisEngine();
    engine.ingestLine(
      "26:08:18:12:04:00.0::Enemy,C[7 M31_Trial_Boss],,*,Tank,P[1@2 Tank@test],Blocked Hit,Pn.block,Shield,,-25,-40",
    );
    const snapshot = engine.snapshot("fixture.log");
    const tank = snapshot.entities.find((entity) => entity.baseName === "Tank");
    expect(snapshot.encounters).toHaveLength(1);
    expect(tank?.mitigation).toBe(40);
  });
});

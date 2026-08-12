import { describe, expect, it } from "vitest";
import { CombatAnalysisEngine } from "../src/core/analysisEngine";
import { parseCombatLogLine } from "../src/core/combatLogParser";

describe("additional damage proc parsing", () => {
  it("counts non-Physical damage schools in player totals and breakdown", () => {
    const engine = new CombatAnalysisEngine();

    engine.ingestLine(
      "26:08:12:02:30:00.0::opop,P[518872298@18657381 opop@test#0001],,*,Frost Giant,C[17 Giant_Frost],Arcane Strike,Pn.arcane,Arcane,Critical,2500,3000",
    );
    engine.ingestLine(
      "26:08:12:02:30:00.1::opop,P[518872298@18657381 opop@test#0001],,*,Frost Giant,C[17 Giant_Frost],Giant Slayer,Pn.giantslayer,Radiant,,5000,5000",
    );

    const snapshot = engine.snapshot("test.log");
    const player = snapshot.players.find((item) => item.name === "opop");

    expect(player).toBeDefined();
    expect(player?.totalDamage).toBe(7500);
    expect(player?.abilities.map((ability) => ability.name)).toEqual(
      expect.arrayContaining(["Arcane Strike", "Giant Slayer"]),
    );
  });

  it("attributes proc damage when the player is present in source instead of owner", () => {
    const engine = new CombatAnalysisEngine();

    engine.ingestLine(
      "26:08:12:02:31:00.0::,,opop,P[518872298@18657381 opop@test#0001],Frost Giant,C[18 Giant_Frost],Giant Slayer,Pn.giantslayer,Fire,,4200,4200",
    );

    const snapshot = engine.snapshot("test.log");
    const player = snapshot.players.find((item) => item.name === "opop");

    expect(player?.totalDamage).toBe(4200);
    expect(snapshot.encounters).toHaveLength(1);
  });

  it("resolves target=* proc lines into the source entity and keeps them in encounter breakdown", () => {
    const engine = new CombatAnalysisEngine();
    const line =
      "26:08:12:20:40:00.0::Correk,P[201028460@1546238 Correk@Gleyvien],Target Dummy,C[265291 Entity_Targetdummy],,*,Doom!,Pn.F1j0yx1,Radiant,Critical,10557.2,8445.78";

    const parsed = parseCombatLogLine(line, 1);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.event.target.kind).toBe("creature");
    expect(parsed.event.target.instanceId).toBe(parsed.event.source.instanceId);

    engine.ingestLine(line);
    const snapshot = engine.snapshot("test.log");
    const player = snapshot.players.find((item) => item.name === "Correk");

    expect(player?.totalDamage).toBeCloseTo(10557.2);
    expect(player?.abilities.map((ability) => ability.name)).toContain("Doom!");
    expect(snapshot.encounters).toHaveLength(1);

    const encounter = snapshot.encounters[0];
    expect(encounter).toBeDefined();
    if (!encounter || !player) return;
    const detail = engine.getEntityDetail(encounter.id, false, player.playerId);
    expect(detail?.outgoingDamage).toBeCloseTo(10557.2);
    expect(detail?.outgoingDamagePowers.map((power) => power.name)).toContain(
      "Doom!",
    );
  });

  it("resolves source=* to owner for all combat actions", () => {
    const line =
      "26:08:12:20:41:00.0::opop,P[518872298@18657381 opop@test#0001],,*,Frost Giant,C[21 Giant_Frost],Generic Proc,Pn.genericproc,Necrotic,,3333,3333";
    const parsed = parseCombatLogLine(line, 1);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.event.source.stableId).toBe(parsed.event.owner.stableId);

    const engine = new CombatAnalysisEngine();
    engine.ingestLine(line);
    const snapshot = engine.snapshot("test.log");
    const player = snapshot.players.find((item) => item.name === "opop");
    expect(player?.totalDamage).toBe(3333);
    expect(player?.abilities.map((ability) => ability.name)).toContain(
      "Generic Proc",
    );
  });

  it("resolves a completely blank source to owner", () => {
    const line =
      "26:08:12:20:42:00.0::opop,P[518872298@18657381 opop@test#0001],,,Frost Giant,C[22 Giant_Frost],Blank Source Proc,Pn.blanksource,Fire,,2222,2222";
    const parsed = parseCombatLogLine(line, 1);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.event.source.stableId).toBe(parsed.event.owner.stableId);

    const engine = new CombatAnalysisEngine();
    engine.ingestLine(line);
    const snapshot = engine.snapshot("test.log");
    const player = snapshot.players.find((item) => item.name === "opop");
    expect(player?.totalDamage).toBe(2222);
    expect(snapshot.encounters).toHaveLength(1);
  });

  it("does not turn control/resource effects into damage", () => {
    const engine = new CombatAnalysisEngine();

    engine.ingestLine(
      "26:08:12:02:32:00.0::opop,P[518872298@18657381 opop@test#0001],,*,Frost Giant,C[19 Giant_Frost],Tempest Slash,Pn.hit,Physical,,1000,1000",
    );
    engine.ingestLine(
      "26:08:12:02:32:00.1::opop,P[518872298@18657381 opop@test#0001],,*,Frost Giant,C[19 Giant_Frost],Control Proc,Pn.control,Hold,ShowPowerDisplayName,25,0",
    );
    engine.ingestLine(
      "26:08:12:02:32:00.2::opop,P[518872298@18657381 opop@test#0001],,*,Frost Giant,C[19 Giant_Frost],Resource Proc,Pn.resource,Power,,50,0",
    );

    const snapshot = engine.snapshot("test.log");
    const player = snapshot.players.find((item) => item.name === "opop");

    expect(player?.totalDamage).toBe(1000);
    expect(player?.abilities.map((ability) => ability.name)).toEqual([
      "Tempest Slash",
    ]);
  });
});

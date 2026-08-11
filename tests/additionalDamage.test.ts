import { describe, expect, it } from "vitest";
import { CombatAnalysisEngine } from "../src/core/analysisEngine";

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

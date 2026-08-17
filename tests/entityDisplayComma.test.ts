import { describe, expect, it } from "vitest";
import { CombatAnalysisEngine } from "../src/core/analysisEngine";
import { parseCombatLogLine } from "../src/core/combatLogParser";

describe("unquoted commas in Neverwinter entity display names", () => {
  it("parses the real Valkariel, the Corrupted combatlog format", () => {
    const line =
      "26:08:16:15:10:40.0::phlex,P[517482360@6562896 phlex@illixir],,*,Valkariel, the Corrupted,C[29 M31_Trial_Boss_Valkariel],Shadow Strike,Pn.L2gdc8,Physical,Critical|Flank,2.11428e+06,2.94993e+06";

    const parsed = parseCombatLogLine(line, 92);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.event.target.kind).toBe("creature");
    expect(parsed.event.target.displayName).toBe("Valkariel, the Corrupted");
    expect(parsed.event.target.archetype).toBe("M31_Trial_Boss_Valkariel");
    expect(parsed.event.abilityName).toBe("Shadow Strike");
    expect(parsed.event.magnitude).toBeCloseTo(2.11428e6);

    const engine = new CombatAnalysisEngine();
    engine.ingestLine(line);
    const snapshot = engine.snapshot("combatlog.log");

    expect(snapshot.parseErrors).toBe(0);
    expect(snapshot.targets.map((target) => target.name)).toContain(
      "Valkariel, the Corrupted",
    );
    expect(snapshot.encounters[0]?.primaryTarget).toBe(
      "Valkariel, the Corrupted",
    );
  });

  it("also repairs a comma-containing creature when it appears as the source", () => {
    const line =
      "26:08:16:15:10:40.6::Watts GWF,P[518824934@20850621 Watts GWF@wattdogg1017#8568],Valkariel, the Corrupted,C[29 M31_Trial_Boss_Valkariel],,*,Power at Any Cost,Pn.F77il21,Physical,,132955,174108";

    const parsed = parseCombatLogLine(line, 104);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.event.source.displayName).toBe("Valkariel, the Corrupted");
    expect(parsed.event.source.archetype).toBe("M31_Trial_Boss_Valkariel");
    expect(parsed.event.abilityName).toBe("Power at Any Cost");
  });

  it("handles any unquoted comma in a creature display name without a boss whitelist", () => {
    const line =
      "26:08:16:16:00:00.0::opop,P[1@2 opop@test],,*,Commander, the Fallen,C[123 Generic_Boss_Archetype],Generic Strike,Pn.generic,Physical,,125000,125000";

    const parsed = parseCombatLogLine(line, 1);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.event.target.displayName).toBe("Commander, the Fallen");
    expect(parsed.event.target.archetype).toBe("Generic_Boss_Archetype");
  });

  it("still keeps quoted comma-containing ability names intact", () => {
    const line =
      '26:08:16:16:00:01.0::opop,P[1@2 opop@test],,*,Commander, the Fallen,C[123 Generic_Boss_Archetype],"Additional Proc, Rank 3",Pn.proc,Fire,,7777,7777';

    const parsed = parseCombatLogLine(line, 1);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.event.target.displayName).toBe("Commander, the Fallen");
    expect(parsed.event.abilityName).toBe("Additional Proc, Rank 3");
  });
});

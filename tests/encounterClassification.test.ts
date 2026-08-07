import { describe, expect, it } from "vitest";
import { CombatAnalysisEngine } from "../src/core/analysisEngine";

function hit(
  second: number,
  targetName: string,
  targetRaw: string,
  amount = 100,
  flags = "",
): string {
  const seconds = String(second).padStart(2, "0");
  return `26:08:02:22:00:${seconds}.0::opop,P[1@2 opop@test],,*,${targetName},${targetRaw},Oath Strike,Pn.hit,Physical,${flags},${amount},${amount}`;
}

describe("encounter classification", () => {
  it("boss add dalgaları varken bossu tanır ve boss ölünce kalan mobları AOE'ye ayırır", () => {
    const engine = new CombatAnalysisEngine();

    for (let second = 0; second <= 12; second += 1) {
      engine.ingestLine(
        hit(
          second,
          "Boss Prime",
          "C[17 Trial_Boss_Prime]",
          100,
          second === 12 ? "Kill" : "",
        ),
      );
      if (second >= 2 && second <= 11) {
        engine.ingestLine(hit(second, "Add Alpha", "C[21 Add_Alpha]", 250));
        engine.ingestLine(hit(second, "Add Beta", "C[22 Add_Beta]", 250));
      }
    }

    engine.ingestLine(hit(13, "Remnant", "C[40 Add_Remnant]", 500));
    const encounters = engine.snapshot("fixture.log").encounters;

    expect(encounters).toHaveLength(2);
    expect(encounters[0]?.primaryTarget).toContain("BOSS");
    expect(encounters[0]?.primaryTarget).toContain("Boss Prime");
    expect(encounters[1]?.primaryTarget).toContain("AOE");
    expect(encounters[1]?.primaryTarget).toContain("Remnant");
  });

  it("öldürülmeden bırakılan bossu yeni dövüş başlayınca FAIL olarak kapatır", () => {
    const engine = new CombatAnalysisEngine();

    for (let second = 0; second <= 10; second += 1) {
      engine.ingestLine(hit(second, "Boss Prime", "C[17 Trial_Boss_Prime]", 120));
      if (second >= 2 && second <= 9) {
        engine.ingestLine(hit(second, "Boss Add", "C[21 Add_Boss]", 120));
      }
    }

    engine.ingestLine(hit(17, "Hallway Mob", "C[77 Hallway_Mob]", 300));
    const encounters = engine.snapshot("fixture.log").encounters;

    expect(encounters).toHaveLength(2);
    expect(encounters[0]?.primaryTarget).toContain("FAIL");
    expect(encounters[0]?.primaryTarget).toContain("BOSS");
    expect(encounters[1]?.primaryTarget).toContain("AOE");
    expect(encounters[1]?.primaryTarget).toContain("Hallway Mob");
  });

  it("kullanıcının başlattığı encounterı manuel olarak ayırır", () => {
    const engine = new CombatAnalysisEngine();
    engine.ingestLine(hit(0, "First Pack", "C[31 First_Pack]", 100));

    engine.startNewEncounter();
    engine.ingestLine(hit(1, "Manual Target", "C[32 Manual_Target]", 200));
    engine.endEncounter();

    const encounters = engine.snapshot("fixture.log").encounters;
    expect(encounters).toHaveLength(2);
    expect(encounters[1]?.primaryTarget).toContain("MANUAL");
    expect(encounters[1]?.primaryTarget).toContain("Manual Target");
  });
});

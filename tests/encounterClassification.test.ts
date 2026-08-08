import { describe, expect, it } from "vitest";
import { CombatAnalysisEngine } from "../src/core/analysisEngine";

function hit(
  elapsedSeconds: number,
  targetName: string,
  targetRaw: string,
  amount = 100,
  flags = "",
): string {
  const hours = 22 + Math.floor(elapsedSeconds / 3600);
  const remaining = elapsedSeconds % 3600;
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  return `26:08:02:${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.0::opop,P[1@2 opop@test],,*,${targetName},${targetRaw},Oath Strike,Pn.hit,Physical,${flags},${amount},${amount}`;
}

describe("simple encounter segmentation", () => {
  it("boss veya AOE sınıflandırması yapmadan ana hedef adını gösterir", () => {
    const engine = new CombatAnalysisEngine();

    for (let second = 0; second <= 13; second += 1) {
      engine.ingestLine(
        hit(
          second,
          "Hunang",
          "C[101 Trial_Hunang]",
          700,
          second === 13 ? "Kill" : "",
        ),
      );
      engine.ingestLine(hit(second, "Hunang Add", "C[201 Hunang_Add]", 110));
      engine.ingestLine(hit(second, "Hunang Add", "C[202 Hunang_Add]", 110));
    }

    const encounter = engine.snapshot("fixture.log").encounters[0];
    expect(encounter?.durationSeconds).toBe(13);
    expect(encounter?.primaryTarget).toBe("Hunang");
    expect(encounter?.primaryTarget).not.toContain("BOSS");
    expect(encounter?.primaryTarget).not.toContain("AOE");
    expect(encounter?.bossTargetId).toBeUndefined();
  });

  it("Kill flag encounterı özel bir boss kuralıyla kapatmaz", () => {
    const engine = new CombatAnalysisEngine();

    engine.ingestLine(hit(0, "Target A", "C[1 Target_A]", 100));
    engine.ingestLine(hit(5, "Target A", "C[1 Target_A]", 100, "Kill"));
    engine.ingestLine(hit(8, "Target B", "C[2 Target_B]", 100));

    const encounters = engine.snapshot("fixture.log").encounters;
    expect(encounters).toHaveLength(1);
    expect(encounters[0]?.durationSeconds).toBe(8);
  });

  it("10 saniyeden uzun hostile boşlukta yeni encounter açar", () => {
    const engine = new CombatAnalysisEngine();

    engine.ingestLine(hit(0, "First Pack", "C[1 First_Pack]", 100));
    engine.ingestLine(hit(6, "First Pack", "C[1 First_Pack]", 100));
    engine.ingestLine(hit(18, "Second Pack", "C[2 Second_Pack]", 100));

    const encounters = engine.snapshot("fixture.log").encounters;
    expect(encounters).toHaveLength(2);
    expect(encounters[0]?.primaryTarget).toBe("First Pack");
    expect(encounters[1]?.primaryTarget).toBe("Second Pack");
  });

  it("10 saniye veya daha kısa boşlukta aynı encounterı sürdürür", () => {
    const engine = new CombatAnalysisEngine();

    engine.ingestLine(hit(0, "First Target", "C[1 First_Target]", 100));
    engine.ingestLine(hit(10, "Second Target", "C[2 Second_Target]", 200));

    const encounters = engine.snapshot("fixture.log").encounters;
    expect(encounters).toHaveLength(1);
    expect(encounters[0]?.durationSeconds).toBe(10);
  });

  it("All Encounters süresinde pull aralarını kesmez; 12 dakikalık run 12 dakika görünür", () => {
    const engine = new CombatAnalysisEngine();

    // Only a few short combat bursts across a 12 minute run. The old logic
    // summed the bursts and therefore displayed a much shorter duration.
    engine.ingestLine(hit(0, "Pack 1", "C[1 Pack_1]", 100));
    engine.ingestLine(hit(60, "Pack 2", "C[2 Pack_2]", 100));
    engine.ingestLine(hit(240, "Pack 3", "C[3 Pack_3]", 100));
    engine.ingestLine(hit(420, "Pack 4", "C[4 Pack_4]", 100));
    engine.ingestLine(hit(720, "Final Target", "C[5 Final_Target]", 100));

    const snapshot = engine.snapshot("fixture.log");
    expect(snapshot.activeCombatSeconds).toBe(720);
    expect(snapshot.encounters.length).toBe(5);
  });

  it("+ New basıldığı anda combatsız 0 saniyelik manuel encounter oluşturur", () => {
    const engine = new CombatAnalysisEngine();
    engine.ingestLine(hit(0, "First Pack", "C[31 First_Pack]", 100));

    engine.startNewEncounter();
    const waiting = engine.snapshot("fixture.log").encounters;

    expect(waiting).toHaveLength(2);
    expect(waiting[1]?.durationSeconds).toBe(0);
    expect(waiting[1]?.primaryTarget).toContain("MANUAL");
    expect(waiting[1]?.primaryTarget).toContain("ACTIVE");
    expect(waiting[1]?.primaryTarget).toContain("Waiting for combat");

    engine.ingestLine(hit(1, "Manual Target", "C[32 Manual_Target]", 200));
    engine.endEncounter();

    const encounters = engine.snapshot("fixture.log").encounters;
    expect(encounters[1]?.primaryTarget).toContain("MANUAL");
    expect(encounters[1]?.primaryTarget).toContain("Manual Target");
  });

  it("Fail yalnızca kullanıcı Fail butonuna bastığında eklenir", () => {
    const engine = new CombatAnalysisEngine();
    engine.startNewEncounter();
    engine.ingestLine(hit(0, "Manual Target", "C[50 Manual_Target]", 100));
    engine.markEncounterFail();

    const encounter = engine.snapshot("fixture.log").encounters[0];
    expect(encounter?.primaryTarget).toContain("FAIL");
    expect(encounter?.primaryTarget).toContain("MANUAL");
  });
});

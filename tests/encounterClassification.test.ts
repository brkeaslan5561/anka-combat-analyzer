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

  it("Valkariel -> Zulkir gibi 10 saniyeden kısa gerçek boss handoffunu ayırır", () => {
    const engine = new CombatAnalysisEngine();

    for (let second = 0; second <= 59; second += 1) {
      engine.ingestLine(
        hit(
          second,
          "Valkariel, the Corrupted",
          "C[29 M31_Trial_Boss_Valkariel]",
          700,
        ),
      );
    }

    // Seven seconds after Valkariel last takes player damage, the scripted next
    // boss phase starts. This is below the normal 10 second encounter gap.
    engine.ingestLine(
      hit(
        66,
        "Zulkir Kezaroth",
        "C[30 M31_Trial_Boss_Zulkir_Kezaroth_A]",
        800,
      ),
    );
    engine.ingestLine(
      hit(
        67,
        "Zulkir Kezaroth",
        "C[31 M31_Trial_Boss_Zulkir_Kezaroth_B]",
        800,
      ),
    );
    engine.ingestLine(
      hit(
        68,
        "Zulkir Kezaroth",
        "C[32 M31_Trial_Boss_Zulkir_Kezaroth_C]",
        800,
      ),
    );

    const encounters = engine.snapshot("fixture.log").encounters;
    expect(encounters).toHaveLength(2);
    expect(encounters[0]?.primaryTarget).toBe("Valkariel, the Corrupted");
    expect(encounters[1]?.primaryTarget).toBe("Zulkir Kezaroth");
  });

  it("aynı bossun A/B/C instance veya form varyantlarını ayrı encounter yapmaz", () => {
    const engine = new CombatAnalysisEngine();

    for (let second = 0; second <= 30; second += 1) {
      engine.ingestLine(
        hit(
          second,
          "Zulkir Kezaroth",
          "C[30 M31_Trial_Boss_Zulkir_Kezaroth_A]",
          800,
        ),
      );
    }
    engine.ingestLine(
      hit(
        36,
        "Zulkir Kezaroth",
        "C[31 M31_Trial_Boss_Zulkir_Kezaroth_B]",
        800,
      ),
    );
    engine.ingestLine(
      hit(
        37,
        "Zulkir Kezaroth",
        "C[32 M31_Trial_Boss_Zulkir_Kezaroth_C]",
        800,
      ),
    );

    const encounters = engine.snapshot("fixture.log").encounters;
    expect(encounters).toHaveLength(1);
    expect(encounters[0]?.primaryTarget).toBe("Zulkir Kezaroth");
  });

  it("boss add/mechanic hedefi görünürse gerçek boss fazını yanlış bölmez", () => {
    const engine = new CombatAnalysisEngine();

    for (let second = 0; second <= 30; second += 1) {
      engine.ingestLine(
        hit(second, "Prime Boss", "C[1 Trial_Boss_Prime]", 900),
      );
    }

    // Even though the internal archetype contains Boss, the helper/add identity
    // must not be treated as a new major phase after a short boss lull.
    engine.ingestLine(
      hit(36, "Prime Add", "C[2 Trial_Boss_Prime_Add]", 500),
    );

    const encounters = engine.snapshot("fixture.log").encounters;
    expect(encounters).toHaveLength(1);
    expect(encounters[0]?.primaryTarget).toBe("Prime Boss");
  });

  it("yeni boss benzeri hedef önceki hedef yeterince oturmadan çıkarsa bölmez", () => {
    const engine = new CombatAnalysisEngine();

    for (let second = 0; second <= 8; second += 1) {
      engine.ingestLine(
        hit(second, "Short Boss", "C[1 Trial_Boss_Short]", 900),
      );
    }
    engine.ingestLine(
      hit(14, "Second Boss", "C[2 Trial_Boss_Second]", 900),
    );

    const encounters = engine.snapshot("fixture.log").encounters;
    expect(encounters).toHaveLength(1);
  });

  it("normal boss + sıradan add düzenini başka içeriklerde parçalamaz", () => {
    const engine = new CombatAnalysisEngine();

    for (let second = 0; second <= 25; second += 1) {
      engine.ingestLine(
        hit(second, "Dungeon Boss", "C[1 Dungeon_Boss_Main]", 1_000),
      );
      engine.ingestLine(
        hit(second, "Dungeon Add", "C[20 Dungeon_Add]", 100),
      );
    }

    engine.ingestLine(hit(31, "Dungeon Add", "C[21 Dungeon_Add]", 100));

    const encounters = engine.snapshot("fixture.log").encounters;
    expect(encounters).toHaveLength(1);
    expect(encounters[0]?.primaryTarget).toBe("Dungeon Boss");
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

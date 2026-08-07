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
  it("uzun boss savaşını add dalgaları varken tanır ve boss ölünce kalan mobları AOE'ye ayırır", () => {
    const engine = new CombatAnalysisEngine();

    for (let second = 0; second <= 36; second += 1) {
      engine.ingestLine(
        hit(
          second,
          "Boss Prime",
          "C[17 Trial_Boss_Prime]",
          400,
          second === 36 ? "Kill" : "",
        ),
      );
      if (second >= 5 && second <= 12) {
        engine.ingestLine(hit(second, "Add Alpha", "C[21 Add_Grunt]", 120));
        engine.ingestLine(hit(second, "Add Alpha", "C[22 Add_Grunt]", 120));
      }
      if (second >= 20 && second <= 27) {
        engine.ingestLine(hit(second, "Add Beta", "C[31 Add_Beta]", 150));
      }
    }

    engine.ingestLine(hit(37, "Remnant", "C[40 Add_Remnant]", 500));
    const encounters = engine.snapshot("fixture.log").encounters;

    expect(encounters).toHaveLength(2);
    expect(encounters[0]?.primaryTarget).toContain("BOSS");
    expect(encounters[0]?.primaryTarget).toContain("Boss Prime");
    expect(encounters[0]?.bossTargetName).toBe("Boss Prime");
    expect(encounters[0]?.bossTargetId).toBe("creature-instance:17");
    expect(encounters[0]?.primaryTarget).not.toContain("FAIL");
    expect(encounters[1]?.primaryTarget).toContain("AOE");
    expect(encounters[1]?.primaryTarget).toContain("Remnant");
  });

  it("Hunang gibi kısa bossu yanında iki add olsa da BOSS olarak tanır", () => {
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
    expect(encounter?.primaryTarget).toContain("BOSS");
    expect(encounter?.bossTargetName).toBe("Hunang");
    expect(encounter?.bossTargetId).toBe("creature-instance:101");
  });

  it("kısa trash pullundaki tek elite baskın değilse boss yapmaz", () => {
    const engine = new CombatAnalysisEngine();

    for (let second = 0; second <= 12; second += 1) {
      engine.ingestLine(hit(second, "Elite Guard", "C[301 Elite_Guard]", 300));
      engine.ingestLine(hit(second, "Soldier", "C[302 Hall_Soldier]", 220));
      engine.ingestLine(hit(second, "Mage", "C[303 Hall_Mage]", 210));
    }

    const encounter = engine.snapshot("fixture.log").encounters[0];
    expect(encounter?.primaryTarget).toContain("AOE");
    expect(encounter?.primaryTarget).not.toContain("BOSS");
    expect(encounter?.bossTargetId).toBeUndefined();
  });

  it("aynı archetype'tan birden fazla uzun yaşayan mob olan AOE pullunu boss yapmaz", () => {
    const engine = new CombatAnalysisEngine();

    for (let second = 0; second <= 40; second += 1) {
      engine.ingestLine(hit(second, "Guardian", "C[51 Hall_Guardian]", 300));
      engine.ingestLine(hit(second, "Guardian", "C[52 Hall_Guardian]", 280));
      if (second >= 4) {
        engine.ingestLine(hit(second, "Soldier", "C[60 Hall_Soldier]", 150));
      }
    }

    const encounter = engine.snapshot("fixture.log").encounters[0];
    expect(encounter?.primaryTarget).toContain("AOE");
    expect(encounter?.primaryTarget).not.toContain("BOSS");
  });

  it("uzun AOE'deki tek tanky elite diğer moblardan açık şekilde ayrışmıyorsa boss yapmaz", () => {
    const engine = new CombatAnalysisEngine();

    for (let second = 0; second <= 42; second += 1) {
      engine.ingestLine(hit(second, "Elite Guard", "C[71 Elite_Guard]", 260));
      engine.ingestLine(hit(second, "Warrior", "C[72 Hall_Warrior]", 220));
      if (second >= 2 && second <= 40) {
        engine.ingestLine(hit(second, "Mage", "C[73 Hall_Mage]", 210));
      }
    }

    const encounter = engine.snapshot("fixture.log").encounters[0];
    expect(encounter?.primaryTarget).toContain("AOE");
    expect(encounter?.primaryTarget).not.toContain("BOSS");
  });

  it("Kill flag gelmeyen tamamlanmış bossu sırf sonraki AOE başladığı için FAIL yapmaz", () => {
    const engine = new CombatAnalysisEngine();

    for (let second = 0; second <= 40; second += 1) {
      engine.ingestLine(hit(second, "Boss Prime", "C[17 Trial_Boss_Prime]", 420));
      if (second >= 8 && second <= 17) {
        engine.ingestLine(hit(second, "Boss Add", "C[21 Add_Boss]", 120));
      }
    }

    engine.ingestLine(hit(48, "Hallway Mob", "C[77 Hallway_Mob]", 300));
    const encounters = engine.snapshot("fixture.log").encounters;

    expect(encounters).toHaveLength(2);
    expect(encounters[0]?.primaryTarget).toContain("BOSS");
    expect(encounters[0]?.primaryTarget).not.toContain("FAIL");
    expect(encounters[1]?.primaryTarget).toContain("AOE");
  });

  it("aynı boss kısa süre sonra yeniden engage edilirse önceki denemeyi FAIL yapar", () => {
    const engine = new CombatAnalysisEngine();

    for (let second = 0; second <= 40; second += 1) {
      engine.ingestLine(hit(second, "Boss Prime", "C[17 Trial_Boss_Prime]", 420));
      if (second >= 8 && second <= 17) {
        engine.ingestLine(hit(second, "Boss Add", "C[21 Add_Boss]", 120));
      }
    }

    engine.ingestLine(hit(48, "Hallway Mob", "C[77 Hallway_Mob]", 300));
    engine.ingestLine(hit(56, "Boss Prime", "C[117 Trial_Boss_Prime]", 420));
    const encounters = engine.snapshot("fixture.log").encounters;

    expect(encounters[0]?.primaryTarget).toContain("FAIL");
    expect(encounters[0]?.primaryTarget).toContain("BOSS");
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
});

import { describe, expect, it } from "vitest";
import { CombatAnalysisEngine } from "../src/core/analysisEngine";

function hit(
  elapsedSeconds: number,
  targetName: string,
  targetRaw: string,
  amount = 100,
): string {
  const hour = 15 + Math.floor(elapsedSeconds / 3600);
  const remaining = elapsedSeconds % 3600;
  const minute = 10 + Math.floor(remaining / 60);
  const second = remaining % 60;
  return `26:08:16:${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}.0::opop,P[1@2 opop@test],,*,${targetName},${targetRaw},Oath Strike,Pn.hit,Physical,,${amount},${amount}`;
}

describe("real M31 Valkariel -> Zulkir phase transition", () => {
  it("splits Valkariel from the real Zulkir A/B/C identifiers", () => {
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

    // These are the identifiers observed in the uploaded real combatlog.
    // They intentionally do NOT contain the word "Boss".
    engine.ingestLine(
      hit(
        66,
        "Zulkir Kezaroth (Enlarged)",
        "C[436 M31_Trial_Zulkir_A]",
        900,
      ),
    );
    engine.ingestLine(
      hit(
        67,
        "Zulkir Baalmede (Enlarged)",
        "C[437 M31_Trial_Zulkir_B]",
        700,
      ),
    );
    engine.ingestLine(
      hit(
        68,
        "Zulkir Letheras (Enlarged)",
        "C[438 M31_Trial_Zulkir_C]",
        600,
      ),
    );

    const encounters = engine.snapshot("m31-real.log").encounters;
    expect(encounters).toHaveLength(2);
    expect(encounters[0]?.primaryTarget).toBe("Valkariel, the Corrupted");
    expect(encounters[1]?.primaryTarget).toBe("Zulkir Kezaroth (Enlarged)");
  });

  it("keeps all three differently-named Zulkirs in one logical encounter", () => {
    const engine = new CombatAnalysisEngine();

    for (let second = 0; second <= 25; second += 1) {
      engine.ingestLine(
        hit(
          second,
          "Zulkir Kezaroth (Enlarged)",
          "C[436 M31_Trial_Zulkir_A]",
          900,
        ),
      );
    }

    engine.ingestLine(
      hit(
        31,
        "Zulkir Baalmede (Enlarged)",
        "C[437 M31_Trial_Zulkir_B]",
        800,
      ),
    );
    engine.ingestLine(
      hit(
        37,
        "Zulkir Letheras (Enlarged)",
        "C[438 M31_Trial_Zulkir_C]",
        800,
      ),
    );

    const encounters = engine.snapshot("m31-real.log").encounters;
    expect(encounters).toHaveLength(1);
    expect(encounters[0]?.primaryTarget).toBe("Zulkir Kezaroth (Enlarged)");
  });

  it("does not mistake real M31 trial mechanics for a new boss phase", () => {
    const engine = new CombatAnalysisEngine();

    for (let second = 0; second <= 30; second += 1) {
      engine.ingestLine(
        hit(
          second,
          "Valkariel, the Corrupted",
          "C[29 M31_Trial_Boss_Valkariel]",
          900,
        ),
      );
    }

    engine.ingestLine(
      hit(
        36,
        "Corrupted Vortex",
        "C[500 M31_Trial_Corrupted_Vortex_Ent]",
        500,
      ),
    );
    engine.ingestLine(
      hit(
        37,
        "Judgement Beam",
        "C[501 M31_Trial_Judgement_Beam_Ent]",
        500,
      ),
    );

    const encounters = engine.snapshot("m31-real.log").encounters;
    expect(encounters).toHaveLength(1);
    expect(encounters[0]?.primaryTarget).toBe("Valkariel, the Corrupted");
  });

  it("rejects helper targets even when Add only appears in an underscored internal id", () => {
    const engine = new CombatAnalysisEngine();

    for (let second = 0; second <= 30; second += 1) {
      engine.ingestLine(
        hit(second, "Prime", "C[1 Trial_Boss_Prime]", 900),
      );
    }

    engine.ingestLine(
      hit(36, "Servitor", "C[2 Trial_Boss_Prime_Add]", 600),
    );

    const encounters = engine.snapshot("generic.log").encounters;
    expect(encounters).toHaveLength(1);
    expect(encounters[0]?.primaryTarget).toBe("Prime");
  });
});

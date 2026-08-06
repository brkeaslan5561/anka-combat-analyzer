import { describe, expect, it } from "vitest";
import {
  buildEnemyPowerSummaries,
  type PowerObservation,
} from "../src/core/cadenceDetector";

function makeTickingPower(
  instance: string,
  baseTime: number,
  castCount: number,
  intervalSeconds: number,
): PowerObservation[] {
  const observations: PowerObservation[] = [];
  for (let cast = 0; cast < castCount; cast += 1) {
    const castStart = baseTime + cast * intervalSeconds * 1_000;
    for (let tick = 0; tick < 9; tick += 1) {
      observations.push({
        enemyId: "creature:Trial_Beholder_Gzemnid",
        enemyName: "Gzemnid",
        enemyInstanceId: instance,
        abilityId: "Pn.Uhk6en1",
        abilityName: "Withering Ray",
        occurredAt: castStart + tick * 2_000,
      });
    }
  }
  return observations;
}

describe("cadence detector", () => {
  it("DoT tiklerini tek kullanıma indirip 24 saniyelik düzeni bulur", () => {
    const observations = [
      ...makeTickingPower("gzemnid-1", 0, 7, 24),
      ...makeTickingPower("gzemnid-2", 1_000_000, 7, 24),
    ];
    const [summary] = buildEnemyPowerSummaries(observations);

    expect(summary.castCount).toBe(14);
    expect(summary.cadence.estimatedIntervalSeconds).toBe(24);
    expect(summary.cadence.classification).toBe("high");
    expect(summary.cadence.directMatchRate).toBe(1);
  });

  it("değişken aralıkları otomatik zamanlayıcı yapmaz", () => {
    const starts = [0, 12, 37, 45, 89, 105, 138].map(
      (seconds) => seconds * 1_000,
    );
    const observations = starts.map((occurredAt) => ({
      enemyId: "creature:Trial_Beholder_Gzemnid",
      enemyName: "Gzemnid",
      enemyInstanceId: "gzemnid-variable",
      abilityId: "Pn.Random",
      abilityName: "Random Power",
      occurredAt,
    }));
    const [summary] = buildEnemyPowerSummaries(observations);

    expect(summary.cadence.classification).not.toBe("high");
    expect(summary.cadence.classification).not.toBe("medium");
  });
});

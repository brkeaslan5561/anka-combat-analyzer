import { describe, expect, it } from "vitest";
import type { IndividualHit, PowerBreakdown } from "../src/shared/types";
import {
  filterHitsForPowers,
  filterHitsForTarget,
} from "../src/renderer/detailFilters";

const hits: IndividualHit[] = [
  { id: "1", lineNumber: 1, timestamp: 1_000, sourceId: "player", sourceName: "opop", targetId: "boss-a", targetName: "Gzemnid", powerId: "ray", powerName: "Withering Ray", type: "Physical", amount: 100, baseAmount: 90, flags: ["Critical"] },
  { id: "2", lineNumber: 2, timestamp: 2_000, sourceId: "boss-b", sourceName: "Clone", targetId: "player", targetName: "opop", powerId: "ray", powerName: "Withering Ray", type: "Physical", amount: 200, baseAmount: 210, flags: [] },
  { id: "3", lineNumber: 3, timestamp: 3_000, sourceId: "boss-a", sourceName: "Gzemnid", targetId: "player", targetName: "opop", powerId: "ray", powerName: "Withering Ray", type: "Physical", amount: 300, baseAmount: 320, flags: ["Flank"] },
];

function power(sourceId?: string): PowerBreakdown {
  return { key: sourceId ? `${sourceId}|ray` : "ray", powerId: "ray", name: "Withering Ray", type: "Physical", sourceId, amount: 300, netAmount: 0, share: 1, combatDps: 30, encDps: 30, average: 150, median: 150, minHit: 100, maxHit: 200, hits: 2, swings: 2, hitRate: 1, criticalRate: 0, flankRate: 0, flankDamageRate: 0, deflectRate: 0, effectiveness: 1 };
}

describe("detail hit filters", () => {
  it("filters a clicked power and distinguishes incoming sources", () => {
    expect(filterHitsForPowers(hits, [power("boss-a")], true).map((hit) => hit.id)).toEqual(["3"]);
    expect(filterHitsForPowers(hits, [power()], false)).toHaveLength(3);
  });

  it("filters clicked target hits", () => {
    expect(filterHitsForTarget(hits, "boss-a").map((hit) => hit.id)).toEqual(["1"]);
  });

  it("matches all internal ids merged under the same visible power name", () => {
    const linkedHits: IndividualHit[] = [
      { ...hits[0], id: "linked-1", powerId: "initial", powerName: "Soul Scorch" },
      { ...hits[0], id: "linked-2", powerId: "dot", powerName: "Soul   Scorch" },
    ];
    const linkedPower = {
      ...power(),
      powerId: "initial",
      name: "Soul Scorch",
    };

    expect(filterHitsForPowers(linkedHits, [linkedPower], false)).toHaveLength(2);
  });
});

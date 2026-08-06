import { describe, expect, it } from "vitest";
import {
  isDamageToCreature,
  parseCombatLogLine,
} from "../src/core/combatLogParser";

describe("combat log parser", () => {
  it("oyuncu hasar satırını ayrıştırır", () => {
    const result = parseCombatLogLine(
      "26:08:02:22:36:41.9::opop,P[518872298@18657381 opop@test#0001],,*,Gzemnid,C[17 Trial_Beholder_Gzemnid],Tempest Slash,Pn.O1m1tz,Physical,Critical|Flank,125000,160000",
      1,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.event.owner.displayName).toBe("opop");
    expect(result.event.owner.stableId).toBe("player:518872298@18657381");
    expect(result.event.target.archetype).toBe("Trial_Beholder_Gzemnid");
    expect(result.event.abilityId).toBe("Pn.O1m1tz");
    expect(result.event.flags).toEqual(["Critical", "Flank"]);
    expect(isDamageToCreature(result.event)).toBe(true);
  });

  it("bilinmeyen satırı güvenli biçimde reddeder", () => {
    const result = parseCombatLogLine("bozuk satır", 2);
    expect(result.ok).toBe(false);
  });
});

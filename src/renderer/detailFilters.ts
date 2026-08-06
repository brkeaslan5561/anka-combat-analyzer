import type { IndividualHit, PowerBreakdown } from "../shared/types";

export function filterHitsForPowers(
  hits: IndividualHit[],
  powers: PowerBreakdown[],
  matchSource: boolean,
): IndividualHit[] {
  if (powers.length === 0) return [];
  return hits.filter((hit) =>
    powers.some(
      (power) =>
        normalizePowerName(hit.powerName) === normalizePowerName(power.name) &&
        (!matchSource || !power.sourceId || hit.sourceId === power.sourceId),
    ),
  );
}

function normalizePowerName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

export function filterHitsForTarget(
  hits: IndividualHit[],
  targetId: string,
): IndividualHit[] {
  return hits.filter((hit) => hit.targetId === targetId);
}

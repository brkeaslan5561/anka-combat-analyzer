import type { CombatEntity, CombatEvent } from "../shared/types";

const TIMESTAMP_PATTERN =
  /^(\d{2}):(\d{2}):(\d{2}):(\d{2}):(\d{2}):(\d{2})\.(\d)::/;
const PLAYER_PATTERN = /^P\[(\d+)@(\d+)\s+(.+)\]$/;
const CREATURE_PATTERN = /^C\[(\d+)\s+(.+)\]$/;

const NON_DAMAGE_EFFECT_TYPES = new Set([
  "HitPoints",
  "HitPointsMax",
  "Shield",
  "Power",
  "Soulweave",
  "Divinity",
  "AttribMod",
  "AttribModExpire",
  "PowerMode",
  "Hold",
  "Root",
  "KnockBack",
  "KnockUp",
  "Disable",
  "Null",
]);

/**
 * Neverwinter damage is not limited to Physical/Poison. Powers and item procs
 * can emit schools such as Arcane, Radiant or Fire, and new proc schools may
 * appear without a parser update. Keep Set.has() compatibility for the rest of
 * the analyzer, but classify every non-control/resource effect as damage.
 */
class DamageEffectTypes extends Set<string> {
  override has(effectType: string): boolean {
    const normalized = effectType.trim();
    return normalized.length > 0 && !NON_DAMAGE_EFFECT_TYPES.has(normalized);
  }
}

export const DAMAGE_EFFECT_TYPES = new DamageEffectTypes([
  "Physical",
  "Poison",
  "Arcane",
  "Radiant",
  "Fire",
  "Cold",
  "Lightning",
  "Necrotic",
  "Force",
  "Psychic",
  "Thunder",
  "Acid",
]);
export const RESOURCE_EFFECT_TYPES = new Set([
  "Power",
  "Soulweave",
  "Divinity",
]);
export const ENEMY_OBSERVATION_TYPES = new Set([
  "Physical",
  "Poison",
  "Shield",
  "Hold",
  "Root",
  "KnockBack",
  "KnockUp",
  "HitPoints",
  "Disable",
]);

const IGNORED_ABILITY_NAMES = new Set(["minor arm injury"]);

export interface ParseSuccess {
  ok: true;
  event: CombatEvent;
}

export interface ParseFailure {
  ok: false;
  reason: string;
}

export type ParseResult = ParseSuccess | ParseFailure;

export function parseCombatLogLine(line: string, lineNumber: number): ParseResult {
  const cleanLine = line.replace(/^\uFEFF/, "").replace(/[\r\n]+$/, "");
  const timestampMatch = cleanLine.match(TIMESTAMP_PATTERN);
  if (!timestampMatch) {
    return { ok: false, reason: "Geçersiz zaman damgası" };
  }

  const separatorIndex = cleanLine.indexOf("::");
  if (separatorIndex < 0) {
    return { ok: false, reason: "Alan ayırıcı bulunamadı" };
  }

  const fields = cleanLine.slice(separatorIndex + 2).split(",");
  if (fields.length !== 12) {
    return {
      ok: false,
      reason: `12 alan beklenirken ${fields.length} alan bulundu`,
    };
  }

  const [
    ownerDisplay,
    ownerRaw,
    sourceDisplay,
    sourceRaw,
    targetDisplay,
    targetRaw,
    abilityName,
    abilityId,
    effectType,
    rawFlags,
    rawMagnitude,
    rawBaseMagnitude,
  ] = fields;

  const magnitude = Number.parseFloat(rawMagnitude);
  const baseMagnitude = Number.parseFloat(rawBaseMagnitude);
  if (!Number.isFinite(magnitude) || !Number.isFinite(baseMagnitude)) {
    return { ok: false, reason: "Hasar değeri okunamadı" };
  }

  const timestamp = parseTimestamp(timestampMatch);
  if (!Number.isFinite(timestamp)) {
    return { ok: false, reason: "Zaman damgası dönüştürülemedi" };
  }

  return {
    ok: true,
    event: {
      lineNumber,
      timestamp,
      timestampText: cleanLine.slice(0, separatorIndex),
      owner: parseEntity(ownerDisplay, ownerRaw),
      source: parseEntity(sourceDisplay, sourceRaw),
      target: parseEntity(targetDisplay, targetRaw),
      abilityName: abilityName.trim() || "Bilinmeyen Güç",
      abilityId: abilityId.trim() || "unknown",
      effectType: effectType.trim(),
      flags: rawFlags ? rawFlags.split("|").filter(Boolean) : [],
      magnitude,
      baseMagnitude,
    },
  };
}

function parseTimestamp(match: RegExpMatchArray): number {
  const [, yy, month, day, hour, minute, second, tenth] = match;
  return new Date(
    2000 + Number(yy),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    Number(tenth) * 100,
  ).getTime();
}

export function parseEntity(displayName: string, rawId: string): CombatEntity {
  const trimmedDisplay = displayName.trim();
  const trimmedRaw = rawId.trim();
  const playerMatch = trimmedRaw.match(PLAYER_PATTERN);
  if (playerMatch) {
    const [, characterId, accountId] = playerMatch;
    const stableId = `player:${characterId}@${accountId}`;
    return {
      kind: "player",
      displayName: trimmedDisplay || extractEmbeddedDisplay(playerMatch[3]),
      rawId: trimmedRaw,
      stableId,
      instanceId: stableId,
      characterId,
      accountId,
    };
  }

  const creatureMatch = trimmedRaw.match(CREATURE_PATTERN);
  if (creatureMatch) {
    const [, instanceNumber, archetype] = creatureMatch;
    return {
      kind: "creature",
      displayName: trimmedDisplay || prettifyArchetype(archetype),
      rawId: trimmedRaw,
      stableId: `creature:${archetype}`,
      instanceId: `creature:${instanceNumber}:${archetype}`,
      instanceNumber,
      archetype,
    };
  }

  return {
    kind: "unknown",
    displayName: trimmedDisplay || "Bilinmeyen",
    rawId: trimmedRaw,
    stableId: `unknown:${trimmedDisplay || trimmedRaw || "empty"}`,
    instanceId: `unknown:${trimmedDisplay || trimmedRaw || "empty"}`,
  };
}

function extractEmbeddedDisplay(value: string): string {
  const handleIndex = value.lastIndexOf("@");
  return handleIndex > 0 ? value.slice(0, handleIndex) : value;
}

function prettifyArchetype(archetype: string): string {
  return archetype
    .replace(/^(Trial|Pet|Entity|M\d+)_/, "")
    .replaceAll("_", " ")
    .trim();
}

function getActorKind(event: CombatEvent): CombatEntity["kind"] {
  return event.owner.kind !== "unknown" ? event.owner.kind : event.source.kind;
}

export function isDamageToCreature(event: CombatEvent): boolean {
  return (
    !isIgnoredCombatEvent(event) &&
    getActorKind(event) === "player" &&
    event.target.kind === "creature" &&
    event.magnitude > 0 &&
    DAMAGE_EFFECT_TYPES.has(event.effectType)
  );
}

export function isHostileCombatEvent(event: CombatEvent): boolean {
  if (
    isIgnoredCombatEvent(event) ||
    !DAMAGE_EFFECT_TYPES.has(event.effectType) ||
    event.magnitude <= 0
  ) {
    return false;
  }

  const actorKind = getActorKind(event);
  return (
    (actorKind === "player" && event.target.kind === "creature") ||
    (actorKind === "creature" &&
      (event.target.kind === "player" || event.target.kind === "creature"))
  );
}

export function isHealingEvent(event: CombatEvent): boolean {
  return event.effectType === "HitPoints" && event.magnitude < 0;
}

export function isMitigationEvent(event: CombatEvent): boolean {
  return event.effectType === "Shield" && event.magnitude < 0;
}

export function isResourceEvent(event: CombatEvent): boolean {
  return RESOURCE_EFFECT_TYPES.has(event.effectType) && event.magnitude !== 0;
}

export function isCombatAnalysisEvent(event: CombatEvent): boolean {
  return (
    !isIgnoredCombatEvent(event) &&
    (DAMAGE_EFFECT_TYPES.has(event.effectType) ||
      isHealingEvent(event) ||
      isMitigationEvent(event) ||
      isResourceEvent(event))
  );
}

export function isEnemyPowerObservation(event: CombatEvent): boolean {
  return (
    !isIgnoredCombatEvent(event) &&
    event.owner.kind === "creature" &&
    event.abilityId.startsWith("Pn.") &&
    (DAMAGE_EFFECT_TYPES.has(event.effectType) ||
      ENEMY_OBSERVATION_TYPES.has(event.effectType)) &&
    event.target.kind !== "unknown"
  );
}

export function isIgnoredCombatEvent(event: CombatEvent): boolean {
  return IGNORED_ABILITY_NAMES.has(normalizeAbilityName(event.abilityName));
}

function normalizeAbilityName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

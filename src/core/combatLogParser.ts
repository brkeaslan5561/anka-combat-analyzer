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

  const fields = parseCombatFields(cleanLine.slice(separatorIndex + 2));
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

  // Neverwinter uses compact references in combatlog lines. This mirrors the
  // long-standing ACT parser rules instead of treating these references as
  // unknown entities:
  //   source=*   -> source is the owner
  //   blank src  -> source is the owner
  //   target=*   -> target is the resolved source
  // Proc/additional-damage lines use these forms frequently, so resolving them
  // here keeps every downstream system (encounters, breakdown, targets, DPS)
  // working without hard-coding any item, feat or proc names.
  const owner = parseEntity(ownerDisplay, ownerRaw);
  const normalizedSourceRaw = sourceRaw.trim();
  const source =
    normalizedSourceRaw === "*" ||
    (normalizedSourceRaw.length === 0 && sourceDisplay.trim().length === 0)
      ? owner
      : parseEntity(sourceDisplay, sourceRaw);
  const target =
    targetRaw.trim() === "*"
      ? source
      : parseEntity(targetDisplay, targetRaw);

  return {
    ok: true,
    event: {
      lineNumber,
      timestamp,
      timestampText: cleanLine.slice(0, separatorIndex),
      owner,
      source,
      target,
      abilityName: abilityName.trim() || "Bilinmeyen Güç",
      abilityId: abilityId.trim() || "unknown",
      effectType: effectType.trim(),
      flags: rawFlags ? rawFlags.split("|").filter(Boolean) : [],
      magnitude,
      baseMagnitude,
    },
  };
}

/**
 * Neverwinter's combatlog is only partly CSV-compliant.
 *
 * Quoted fields (for example "Mark of the Giant Slayer, Rank 2") are handled
 * normally, but some entity display names contain an UNQUOTED comma, such as:
 *
 *   Valkariel, the Corrupted,C[29 M31_Trial_Boss_Valkariel]
 *
 * A normal CSV split sees that as two display-name fields and rejects the line
 * for having 13 fields instead of 12. Recover the six entity fields from their
 * structural raw IDs (P[...], C[...], * or an empty compact reference), then
 * join any remaining pre-ability-ID tokens back into the ability display name.
 * This is intentionally generic and does not whitelist any boss or NPC name.
 */
function parseCombatFields(value: string): string[] {
  const tokens = tokenizeCombatFields(value);
  if (tokens.length < 12) return tokens;

  // The final five logical fields are structurally fixed in the combatlog:
  // abilityId, effectType, flags, magnitude, baseMagnitude.
  const tail = tokens.slice(-5);
  const prefix = tokens.slice(0, -5);
  const logical: string[] = [];
  let cursor = 0;

  for (let pair = 0; pair < 3; pair += 1) {
    const parsed = consumeEntityPair(prefix, cursor);
    if (!parsed) return tokens;
    logical.push(parsed.display, parsed.raw);
    cursor = parsed.nextIndex;
  }

  if (cursor >= prefix.length) return tokens;
  const abilityName = prefix.slice(cursor).join(",");
  return [...logical, abilityName, ...tail];
}

function tokenizeCombatFields(value: string): string[] {
  const fields: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];

    if (character === '"' && (quoted || current.length === 0)) {
      if (quoted && value[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (character === "," && !quoted) {
      fields.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  fields.push(current);
  return fields;
}

function consumeEntityPair(
  fields: string[],
  startIndex: number,
): { display: string; raw: string; nextIndex: number } | null {
  if (startIndex >= fields.length) return null;

  // The normal case, including compact blank references: display,raw.
  if (startIndex + 1 < fields.length) {
    const raw = fields[startIndex + 1] ?? "";
    if (isEntityRawField(raw) || raw.trim().length === 0) {
      return {
        display: fields[startIndex] ?? "",
        raw,
        nextIndex: startIndex + 2,
      };
    }
  }

  // If the display itself contains unquoted commas, find the raw entity ID and
  // join every preceding token back into the single display-name field.
  for (let rawIndex = startIndex + 2; rawIndex < fields.length; rawIndex += 1) {
    const raw = fields[rawIndex] ?? "";
    if (!isEntityRawField(raw)) continue;
    return {
      display: fields.slice(startIndex, rawIndex).join(","),
      raw,
      nextIndex: rawIndex + 1,
    };
  }

  return null;
}

function isEntityRawField(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed === "*" ||
    PLAYER_PATTERN.test(trimmed) ||
    CREATURE_PATTERN.test(trimmed)
  );
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

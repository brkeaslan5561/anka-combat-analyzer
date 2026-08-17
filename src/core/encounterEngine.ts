import type {
  CombatEntity,
  CombatEvent,
  EntityAnalysis,
  EncounterSummary,
  PhaseSummary,
  RawEventSummary,
} from "../shared/types";
import {
  isDamageToCreature,
  isHostileCombatEvent,
} from "./combatLogParser";
import { StatisticsAccumulator } from "./statisticsEngine";

interface PhaseAccumulator {
  id: string;
  index: number;
  startedAt: number;
  endedAt: number;
  targets: Map<string, { name: string; amount: number }>;
  merged: StatisticsAccumulator;
  split: StatisticsAccumulator;
}

type EncounterResult = "active" | "fail" | "ended";

interface EncounterTargetAccumulator {
  name: string;
  stableId: string;
  instanceId: string;
  archetype?: string;
  phaseKey: string;
  amount: number;
  hits: number;
  firstSeenAt: number;
  lastSeenAt: number;
}

interface EncounterAccumulator {
  id: string;
  index: number;
  startedAt: number;
  endedAt: number;
  lastHostileAt: number;
  merged: StatisticsAccumulator;
  split: StatisticsAccumulator;
  phases: PhaseAccumulator[];
  damageTargets: Map<string, EncounterTargetAccumulator>;
  hostileEvents: number;
  result: EncounterResult;
  manual: boolean;
}

const PHASE_TARGET_SILENCE_MS = 5_000;
const PHASE_TARGET_MIN_DURATION_MS = 15_000;
const PHASE_TARGET_MIN_HITS = 12;
const PHASE_TARGET_MIN_DAMAGE_SHARE = 0.45;
const HELPER_TARGET_PATTERN =
  /\b(add|minion|summon|clone|illusion|orb|portal|totem|pillar|tentacle|hand|shard|fragment)\b/i;

/**
 * Encounter segmentation stays intentionally simple for normal content:
 * hostile combat separated by more than the configured gap becomes a new
 * encounter. One extra safeguard handles scripted boss-to-boss handoffs that
 * happen inside that gap, such as Valkariel -> Zulkir.
 *
 * The short handoff rule is deliberately conservative so other dungeons and
 * trials are not fragmented by adds or mechanics. It requires:
 * - a previously dominant major/boss target,
 * - meaningful duration, hit count and damage share,
 * - at least five seconds since that target last took player damage,
 * - a never-before-seen different major/boss target,
 * - and rejects obvious add/helper/mechanic entities.
 *
 * Multiple instances/variants with the same visible name share one phase key,
 * so forms such as Zulkir A/B/C remain one encounter. Manual + New / End / Fail
 * controls remain authoritative.
 */
export class EncounterEngine {
  private readonly completed: EncounterAccumulator[] = [];
  private current: EncounterAccumulator | null = null;

  constructor(private readonly encounterGapSeconds = 10) {}

  ingest(event: CombatEvent): void {
    const hostile = isHostileCombatEvent(event);
    const encounterGapMs = this.encounterGapSeconds * 1_000;

    // A newly-created manual encounter waits visibly for the first real combat
    // line instead of collecting unrelated aura/heal noise.
    if (this.current?.manual && this.current.hostileEvents === 0 && !hostile) {
      return;
    }

    // Normal automatic segmentation remains time-gap based.
    if (this.current && !this.current.manual && this.current.hostileEvents > 0) {
      const gap = event.timestamp - this.current.lastHostileAt;
      if (hostile && gap > encounterGapMs) {
        this.endCurrent();
      } else if (!hostile && gap > encounterGapMs) {
        return;
      }
    }

    // Scripted phase changes can hand combat to a different boss after only a
    // 5-9 second lull. Split only when the stricter major-target rules pass.
    if (
      this.current &&
      !this.current.manual &&
      hostile &&
      this.shouldSplitForMajorTargetTransition(event, this.current)
    ) {
      this.endCurrent();
    }

    if (!this.current) {
      if (!hostile) return;
      this.current = this.createEncounter(event.timestamp, false);
    }

    // Manual placeholders use wall-clock time while waiting. Once combat starts,
    // reset their timing to the first hostile event so their duration is exact.
    if (hostile && this.current.manual && this.current.hostileEvents === 0) {
      this.current.startedAt = event.timestamp;
      this.current.endedAt = event.timestamp;
      this.current.lastHostileAt = event.timestamp;
    }

    if (hostile) {
      this.ingestHostilePhase(event, this.current);
      this.ingestEncounterTarget(event, this.current);
      this.current.hostileEvents += 1;
      this.current.endedAt = Math.max(this.current.endedAt, event.timestamp);
    }

    this.current.merged.ingest(event);
    this.current.split.ingest(event);
    const activePhase = this.current.phases.at(-1);
    activePhase?.merged.ingest(event);
    activePhase?.split.ingest(event);
  }

  getSummaries(): EncounterSummary[] {
    return this.getAll().map((encounter) => this.toSummary(encounter));
  }

  /** Sum of the actual combat bursts, retained for diagnostics. */
  getActiveCombatSeconds(): number {
    return this.getAll().reduce(
      (sum, encounter) =>
        sum + Math.max(0, (encounter.endedAt - encounter.startedAt) / 1_000),
      0,
    );
  }

  /**
   * Elapsed session time from the first hostile event to the latest hostile
   * event. This is what All Encounters should use for its displayed duration
   * and EncDPS denominator; gaps between pulls are not silently removed.
   */
  getElapsedSeconds(): number {
    const encounters = this.getAll().filter((encounter) => encounter.hostileEvents > 0);
    if (encounters.length === 0) return 0;
    const first = encounters[0];
    const last = encounters.at(-1);
    if (!first || !last) return 0;
    return Math.max(0, (last.endedAt - first.startedAt) / 1_000);
  }

  getEntityDetail(
    scopeId: string,
    splitPetDamage: boolean,
    entityId: string,
  ): EntityAnalysis | null {
    for (const encounter of this.getAll()) {
      if (encounter.id === scopeId) {
        const durationSeconds = Math.max(
          1,
          (encounter.endedAt - encounter.startedAt) / 1_000,
        );
        return (splitPetDamage ? encounter.split : encounter.merged)
          .getEntityDetail(entityId, durationSeconds);
      }
      const phase = encounter.phases.find((item) => item.id === scopeId);
      if (phase) {
        const durationSeconds = Math.max(
          1,
          (phase.endedAt - phase.startedAt) / 1_000,
        );
        return (splitPetDamage ? phase.split : phase.merged)
          .getEntityDetail(entityId, durationSeconds);
      }
    }
    return null;
  }

  getRawEvents(scopeId: string): RawEventSummary[] {
    for (const encounter of this.getAll()) {
      if (encounter.id === scopeId) return encounter.merged.getRawEvents();
      const phase = encounter.phases.find((item) => item.id === scopeId);
      if (phase) return phase.merged.getRawEvents();
    }
    return [];
  }

  getEntitySummaries(
    scopeId: string,
    splitPetDamage: boolean,
  ): EntityAnalysis[] {
    for (const encounter of this.getAll()) {
      if (encounter.id === scopeId) {
        const durationSeconds = Math.max(
          1,
          (encounter.endedAt - encounter.startedAt) / 1_000,
        );
        return (splitPetDamage ? encounter.split : encounter.merged)
          .getEntitySummaries(durationSeconds);
      }
      const phase = encounter.phases.find((item) => item.id === scopeId);
      if (phase) {
        const durationSeconds = Math.max(
          1,
          (phase.endedAt - phase.startedAt) / 1_000,
        );
        return (splitPetDamage ? phase.split : phase.merged)
          .getEntitySummaries(durationSeconds);
      }
    }
    return [];
  }

  startNewEncounter(): void {
    this.endCurrent();
    this.current = this.createEncounter(Date.now(), true);
  }

  markCurrentFailed(): void {
    if (!this.current) return;
    this.current.result = "fail";
    this.endCurrent();
  }

  endCurrent(): void {
    if (!this.current) return;
    if (this.current.result === "active") {
      this.current.result = "ended";
    }
    this.completed.push(this.current);
    this.current = null;
  }

  reset(): void {
    this.completed.length = 0;
    this.current = null;
  }

  private createEncounter(timestamp: number, manual: boolean): EncounterAccumulator {
    const index = this.completed.length + 1;
    return {
      id: `encounter-${index}-${timestamp}`,
      index,
      startedAt: timestamp,
      endedAt: timestamp,
      lastHostileAt: timestamp,
      merged: new StatisticsAccumulator(false, 20_000),
      split: new StatisticsAccumulator(true, 20_000),
      phases: [],
      damageTargets: new Map(),
      hostileEvents: 0,
      result: "active",
      manual,
    };
  }

  private shouldSplitForMajorTargetTransition(
    event: CombatEvent,
    encounter: EncounterAccumulator,
  ): boolean {
    if (!isDamageToCreature(event) || event.target.kind !== "creature") return false;
    if (!isMajorPhaseTarget(event.target)) return false;

    const nextPhaseKey = phaseTargetKey(event.target);
    const targets = [...encounter.damageTargets.values()];
    if (targets.length === 0) return false;

    // If this logical target/name already participated in the encounter, it is
    // a returning boss form/instance rather than a new phase handoff.
    if (targets.some((target) => target.phaseKey === nextPhaseKey)) return false;

    const dominant = [...targets].sort((left, right) => right.amount - left.amount)[0];
    if (!dominant || !isMajorTargetAccumulator(dominant)) return false;
    if (dominant.phaseKey === nextPhaseKey) return false;

    const durationMs = encounter.endedAt - encounter.startedAt;
    if (durationMs < PHASE_TARGET_MIN_DURATION_MS) return false;
    if (dominant.hits < PHASE_TARGET_MIN_HITS) return false;

    const totalTargetDamage = targets.reduce((sum, target) => sum + target.amount, 0);
    const dominantShare = totalTargetDamage > 0 ? dominant.amount / totalTargetDamage : 0;
    if (dominantShare < PHASE_TARGET_MIN_DAMAGE_SHARE) return false;

    const oldTargetSilence = event.timestamp - dominant.lastSeenAt;
    return oldTargetSilence >= PHASE_TARGET_SILENCE_MS;
  }

  /**
   * A simple encounter has a single phase. The phase object is retained only
   * for API/UI compatibility with existing detail views.
   */
  private ingestHostilePhase(
    event: CombatEvent,
    encounter: EncounterAccumulator,
  ): void {
    let phase = encounter.phases[0];
    if (!phase) {
      phase = {
        id: `${encounter.id}-phase-1`,
        index: 1,
        startedAt: event.timestamp,
        endedAt: event.timestamp,
        targets: new Map(),
        merged: new StatisticsAccumulator(false, 250),
        split: new StatisticsAccumulator(true, 250),
      };
      encounter.phases.push(phase);
    }

    phase.endedAt = Math.max(phase.endedAt, event.timestamp);
    encounter.lastHostileAt = event.timestamp;

    const enemy =
      event.owner.kind === "creature"
        ? event.owner
        : event.target.kind === "creature"
          ? event.target
          : null;
    if (!enemy) return;

    const amount = isDamageToCreature(event) ? Math.max(1, event.magnitude) : 1;
    const target = phase.targets.get(enemy.stableId) ?? {
      name: enemy.displayName,
      amount: 0,
    };
    target.name = enemy.displayName;
    target.amount += amount;
    phase.targets.set(enemy.stableId, target);
  }

  private ingestEncounterTarget(
    event: CombatEvent,
    encounter: EncounterAccumulator,
  ): void {
    if (!isDamageToCreature(event) || event.target.kind !== "creature") return;
    const amount = Math.max(0, event.magnitude);
    if (amount <= 0) return;

    const key = event.target.instanceId;
    const target = encounter.damageTargets.get(key) ?? {
      name: event.target.displayName,
      stableId: event.target.stableId,
      instanceId: event.target.instanceId,
      archetype: event.target.archetype,
      phaseKey: phaseTargetKey(event.target),
      amount: 0,
      hits: 0,
      firstSeenAt: event.timestamp,
      lastSeenAt: event.timestamp,
    };
    target.name = event.target.displayName;
    target.stableId = event.target.stableId;
    target.archetype = event.target.archetype;
    target.phaseKey = phaseTargetKey(event.target);
    target.amount += amount;
    target.hits += 1;
    target.firstSeenAt = Math.min(target.firstSeenAt, event.timestamp);
    target.lastSeenAt = Math.max(target.lastSeenAt, event.timestamp);
    encounter.damageTargets.set(key, target);
  }

  private getAll(): EncounterAccumulator[] {
    return this.current
      ? [...this.completed, this.current]
      : [...this.completed];
  }

  private toSummary(encounter: EncounterAccumulator): EncounterSummary {
    const durationSeconds = Math.max(
      0,
      (encounter.endedAt - encounter.startedAt) / 1_000,
    );
    const statisticsDuration = Math.max(1, durationSeconds);
    const merged = encounter.merged.build(statisticsDuration, false, false);
    const waitingForCombat = encounter.manual && encounter.hostileEvents === 0;

    const primaryTarget =
      [...encounter.damageTargets.values()].sort(
        (left, right) => right.amount - left.amount,
      )[0]?.name ??
      encounter.phases
        .flatMap((phase) => [...phase.targets.values()])
        .sort((left, right) => right.amount - left.amount)[0]?.name ??
      (waitingForCombat ? "Waiting for combat" : "Bilinmeyen hedef");

    const resultLabel = encounter.result === "fail" ? "FAIL · " : "";
    const manualLabel = encounter.manual ? "MANUAL · " : "";
    const activeLabel =
      encounter.manual && encounter.result === "active" ? "ACTIVE · " : "";

    return {
      id: encounter.id,
      index: encounter.index,
      startedAt: encounter.startedAt,
      endedAt: encounter.endedAt,
      durationSeconds,
      totalDamage: merged.totalDamage,
      totalHealing: merged.totalHealing,
      entityCount: merged.entities.length,
      primaryTarget: `${resultLabel}${manualLabel}${activeLabel}${primaryTarget}`,
      phases: encounter.phases.map(toPhaseSummary),
      mergedEntities: [],
      splitEntities: [],
      deaths: merged.deaths,
      rawEvents: merged.rawEvents,
      playerDamage: merged.entities
        .filter(
          (entity) => entity.kind === "player" && entity.outgoingDamage > 0,
        )
        .map((entity) => ({
          playerId: entity.entityId,
          name: entity.name,
          damage: entity.outgoingDamage,
          dps: entity.combatDps,
          combatDps: entity.combatDps,
          encDps: entity.encDps,
        }))
        .sort((left, right) => right.damage - left.damage),
    };
  }
}

function phaseTargetKey(entity: CombatEntity): string {
  const display = entity.displayName.trim().replace(/\s+/g, " ");
  if (display.length > 0) return display.toLocaleLowerCase("en-US");
  return (entity.archetype ?? entity.stableId)
    .replace(/[_-](a|b|c|d|phase[_-]?\d+|form[_-]?\d+)$/i, "")
    .toLocaleLowerCase("en-US");
}

function isMajorPhaseTarget(entity: CombatEntity): boolean {
  if (entity.kind !== "creature") return false;
  const archetype = entity.archetype ?? "";
  const identity = `${entity.displayName} ${archetype}`;
  if (HELPER_TARGET_PATTERN.test(identity)) return false;

  // The short-handoff exception intentionally uses structural combatlog boss
  // metadata. Targets without a boss-like archetype still use the normal 10s
  // encounter-gap rule, which keeps this change low-risk for other content.
  return archetype.toLocaleLowerCase("en-US").includes("boss");
}

function isMajorTargetAccumulator(target: EncounterTargetAccumulator): boolean {
  const identity = `${target.name} ${target.archetype ?? ""}`;
  if (HELPER_TARGET_PATTERN.test(identity)) return false;
  return (target.archetype ?? "").toLocaleLowerCase("en-US").includes("boss");
}

function toPhaseSummary(phase: PhaseAccumulator): PhaseSummary {
  const durationSeconds = Math.max(
    1,
    (phase.endedAt - phase.startedAt) / 1_000,
  );
  const merged = phase.merged.build(durationSeconds, false, false);
  return {
    id: phase.id,
    index: phase.index,
    startedAt: phase.startedAt,
    endedAt: phase.endedAt,
    durationSeconds,
    primaryTarget:
      [...phase.targets.values()].sort(
        (left, right) => right.amount - left.amount,
      )[0]?.name ?? "Bilinmeyen hedef",
    totalDamage: merged.totalDamage,
    totalHealing: merged.totalHealing,
    entityCount: merged.entities.length,
    mergedEntities: [],
    splitEntities: [],
    deaths: merged.deaths,
    rawEvents: merged.rawEvents,
  };
}

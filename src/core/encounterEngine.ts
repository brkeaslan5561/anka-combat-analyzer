import type {
  CombatEntity,
  CombatEvent,
  CombatRunSummary,
  EntityAnalysis,
  EncounterSummary,
  PhaseSummary,
  RawEventSummary,
} from "../shared/types";
import { parseAggregateScopeId } from "../shared/analysisScope";
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
  runId: string;
  runIndex: number;
  contentKey?: string;
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
  /\b(add|minion|summon|clone|illusion|orb|portal|totem|pillar|tentacle|hand|shard|fragment|vortex|beam|caster|mirage|lootdropper)\b/i;
const M31_ZULKIR_ARCHETYPE_PATTERN = /^M31_Trial_Zulkir_([ABC])$/i;
const M31_ZULKIR_PHASE_KEY = "m31:trial:zulkir";
const RUN_GAP_MS = 10 * 60 * 1_000;

/**
 * Encounter segmentation stays intentionally simple for normal content:
 * hostile combat separated by more than the configured gap becomes a new
 * encounter. One extra safeguard handles scripted boss-to-boss handoffs that
 * happen inside that gap, such as Valkariel -> the M31 Zulkir trio.
 *
 * The generic handoff path remains conservative. M31's Zulkirs are a narrowly
 * scoped exception based on identifiers observed in the real user combatlog:
 * M31_Trial_Zulkir_A/B/C. Those IDs do not contain the word "Boss", so the old
 * v1.1.13 heuristic could never recognize the transition. A/B/C share one phase
 * key even though their visible names are Kezaroth, Baalmede and Letheras.
 *
 * Normal dungeon/trial behavior is otherwise unchanged. Manual + New / End /
 * Fail controls remain authoritative.
 */
export class EncounterEngine {
  private readonly completed: EncounterAccumulator[] = [];
  private current: EncounterAccumulator | null = null;
  private readonly aggregateCache = new Map<
    string,
    { statistics: StatisticsAccumulator; durationSeconds: number }
  >();

  constructor(private readonly encounterGapSeconds = 10) {}

  ingest(event: CombatEvent): boolean {
    const hostile = isHostileCombatEvent(event);
    const encounterGapMs = this.encounterGapSeconds * 1_000;

    if (this.current?.manual && this.current.hostileEvents === 0 && !hostile) {
      return false;
    }

    if (this.current && !this.current.manual && this.current.hostileEvents > 0) {
      const gap = event.timestamp - this.current.lastHostileAt;
      if (hostile && gap > encounterGapMs) {
        this.endCurrent();
      } else if (!hostile && gap > encounterGapMs) {
        return false;
      }
    }

    if (
      this.current &&
      !this.current.manual &&
      hostile &&
      this.shouldSplitForMajorTargetTransition(event, this.current)
    ) {
      this.endCurrent();
    }

    if (!this.current) {
      if (!hostile) return false;
      this.current = this.createEncounter(event.timestamp, false, event);
    }

    if (hostile && this.current.manual && this.current.hostileEvents === 0) {
      const contentKey = inferContentKey(event);
      const previous = this.completed.at(-1);
      if (
        contentKey &&
        previous?.contentKey &&
        contentKey !== previous.contentKey &&
        this.current.runIndex === previous.runIndex
      ) {
        this.current.runIndex = previous.runIndex + 1;
        this.current.runId = `run-${this.current.runIndex}-${event.timestamp}`;
      }
      this.current.contentKey = contentKey ?? this.current.contentKey;
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
    this.aggregateCache.clear();
    return true;
  }

  getSummaries(): EncounterSummary[] {
    return this.getAll().map((encounter) => this.toSummary(encounter));
  }

  getRunSummaries(
    summaries: EncounterSummary[] = this.getSummaries(),
  ): CombatRunSummary[] {
    const encounters = this.getAll();
    const runs = new Map<number, EncounterSummary[]>();
    for (const encounter of summaries) {
      const entries = runs.get(encounter.runIndex) ?? [];
      entries.push(encounter);
      runs.set(encounter.runIndex, entries);
    }
    return [...runs.entries()].map(([index, entries]) => {
      const first = entries[0];
      const last = entries.at(-1);
      const accumulator = encounters.find(
        (item) => item.runIndex === index && item.contentKey,
      );
      const currentRun = this.current?.runIndex === index;
      return {
        id: first?.runId ?? `run-${index}`,
        index,
        startedAt: first?.startedAt ?? 0,
        endedAt: last?.endedAt ?? first?.startedAt ?? 0,
        durationSeconds: calculateElapsedDuration(
          encounters.filter((item) => item.runIndex === index),
        ),
        totalDamage: entries.reduce((sum, item) => sum + item.totalDamage, 0),
        totalHealing: entries.reduce((sum, item) => sum + item.totalHealing, 0),
        encounterIds: entries.map((item) => item.id),
        contentKey: accumulator?.contentKey,
        active: Boolean(currentRun),
      };
    });
  }

  getActiveCombatSeconds(): number {
    return this.getAll().reduce(
      (sum, encounter) =>
        sum + Math.max(0, (encounter.endedAt - encounter.startedAt) / 1_000),
      0,
    );
  }

  getElapsedSeconds(): number {
    return calculateElapsedDuration(this.getAll());
  }

  getEntityDetail(
    scopeId: string,
    splitPetDamage: boolean,
    entityId: string,
  ): EntityAnalysis | null {
    const aggregate = this.buildAggregateScope(scopeId, splitPetDamage);
    if (aggregate) {
      return aggregate.statistics.getEntityDetail(
        entityId,
        Math.max(1, aggregate.durationSeconds),
      );
    }
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
    const aggregate = this.buildAggregateScope(scopeId, false);
    if (aggregate) return aggregate.statistics.getRawEvents();
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
    const aggregate = this.buildAggregateScope(scopeId, splitPetDamage);
    if (aggregate) {
      return aggregate.statistics.getEntitySummaries(
        Math.max(1, aggregate.durationSeconds),
      );
    }
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

  startNewRun(): void {
    this.endCurrent();
    this.current = this.createEncounter(Date.now(), true, undefined, true);
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
    this.aggregateCache.clear();
  }

  private createEncounter(
    timestamp: number,
    manual: boolean,
    firstEvent?: CombatEvent,
    forceNewRun = false,
  ): EncounterAccumulator {
    const index = this.completed.length + 1;
    const previous = this.completed.at(-1);
    const contentKey = firstEvent ? inferContentKey(firstEvent) : undefined;
    const contentChanged = Boolean(
      previous?.contentKey && contentKey && previous.contentKey !== contentKey,
    );
    const longGap = Boolean(
      previous && timestamp - previous.endedAt >= RUN_GAP_MS,
    );
    const startsRun = !previous || forceNewRun || contentChanged || longGap;
    const runIndex = startsRun ? (previous?.runIndex ?? 0) + 1 : previous.runIndex;
    const runId = startsRun ? `run-${runIndex}-${timestamp}` : previous.runId;
    return {
      id: `encounter-${index}-${timestamp}`,
      index,
      runId,
      runIndex,
      contentKey: contentKey ?? (startsRun ? undefined : previous?.contentKey),
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

  private buildAggregateScope(
    scopeId: string,
    splitPetDamage: boolean,
  ): { statistics: StatisticsAccumulator; durationSeconds: number } | null {
    const scope = parseAggregateScopeId(scopeId);
    if (!scope) return null;
    const cacheKey = `${splitPetDamage ? "split" : "merged"}:${scopeId}`;
    const cached = this.aggregateCache.get(cacheKey);
    if (cached) return cached;
    const requested = new Set(scope.encounterIds);
    const encounters = this.getAll().filter((item) => requested.has(item.id));
    const statistics = new StatisticsAccumulator(splitPetDamage, 20_000);
    for (const encounter of encounters) {
      statistics.mergeFrom(splitPetDamage ? encounter.split : encounter.merged);
    }
    const durationSeconds =
      scope.mode === "sum"
        ? encounters.reduce(
            (sum, item) =>
              sum + Math.max(0, (item.endedAt - item.startedAt) / 1_000),
            0,
          )
        : calculateElapsedDuration(encounters);
    const aggregate = { statistics, durationSeconds };
    this.aggregateCache.set(cacheKey, aggregate);
    return aggregate;
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
    encounter.contentKey ??= inferContentKey(event);
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
      runId: encounter.runId,
      runIndex: encounter.runIndex,
      contentKey: encounter.contentKey,
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
  const archetype = entity.archetype?.trim() ?? "";
  if (M31_ZULKIR_ARCHETYPE_PATTERN.test(archetype)) {
    return M31_ZULKIR_PHASE_KEY;
  }

  const display = entity.displayName.trim().replace(/\s+/g, " ");
  if (display.length > 0) return display.toLocaleLowerCase("en-US");
  return (archetype || entity.stableId)
    .replace(/[_-](a|b|c|d|phase[_-]?\d+|form[_-]?\d+)$/i, "")
    .toLocaleLowerCase("en-US");
}

function normalizeHelperIdentity(value: string): string {
  return value.replace(/[_-]+/g, " ");
}

function isMajorPhaseTarget(entity: CombatEntity): boolean {
  if (entity.kind !== "creature") return false;
  const archetype = entity.archetype ?? "";
  const identity = normalizeHelperIdentity(`${entity.displayName} ${archetype}`);
  if (HELPER_TARGET_PATTERN.test(identity)) return false;

  if (M31_ZULKIR_ARCHETYPE_PATTERN.test(archetype)) return true;
  return archetype.toLocaleLowerCase("en-US").includes("boss");
}

function isMajorTargetAccumulator(target: EncounterTargetAccumulator): boolean {
  const archetype = target.archetype ?? "";
  const identity = normalizeHelperIdentity(`${target.name} ${archetype}`);
  if (HELPER_TARGET_PATTERN.test(identity)) return false;

  if (M31_ZULKIR_ARCHETYPE_PATTERN.test(archetype)) return true;
  return archetype.toLocaleLowerCase("en-US").includes("boss");
}

function inferContentKey(event: CombatEvent): string | undefined {
  const creatures = [event.target, event.owner, event.source].filter(
    (entity): entity is CombatEntity => entity.kind === "creature",
  );
  for (const creature of creatures) {
    const archetype = creature.archetype ?? "";
    const moduleContent = archetype.match(
      /^(M\d+)_(Trial|Dungeon|Skirmish|Queue)(?:_|$)/i,
    );
    if (moduleContent) {
      return `${moduleContent[1].toUpperCase()} ${titleCase(moduleContent[2])}`;
    }
  }
  return undefined;
}

function titleCase(value: string): string {
  const lower = value.toLocaleLowerCase("en-US");
  return lower.slice(0, 1).toLocaleUpperCase("en-US") + lower.slice(1);
}

function calculateElapsedDuration(encounters: EncounterAccumulator[]): number {
  const hostile = encounters.filter((item) => item.hostileEvents > 0);
  const byRun = new Map<number, EncounterAccumulator[]>();
  for (const encounter of hostile) {
    const values = byRun.get(encounter.runIndex) ?? [];
    values.push(encounter);
    byRun.set(encounter.runIndex, values);
  }
  let seconds = 0;
  for (const values of byRun.values()) {
    const first = values[0];
    const last = values.at(-1);
    if (first && last) {
      seconds += Math.max(0, (last.endedAt - first.startedAt) / 1_000);
    }
  }
  return seconds;
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

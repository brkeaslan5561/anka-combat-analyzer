import type {
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

type EncounterKind = "aoe" | "boss";
type EncounterResult = "active" | "success" | "fail" | "ended";

interface EncounterTargetAccumulator {
  name: string;
  stableId: string;
  instanceId: string;
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
  kind: EncounterKind;
  result: EncounterResult;
  bossTargetId?: string;
  bossStableId?: string;
  bossTargetName?: string;
  manual: boolean;
}

export class EncounterEngine {
  private readonly completed: EncounterAccumulator[] = [];
  private current: EncounterAccumulator | null = null;

  constructor(
    private readonly inactivitySeconds = 20,
    private readonly phaseGapSeconds = 6,
  ) {}

  ingest(event: CombatEvent): void {
    const hostile = isHostileCombatEvent(event);
    const inactivityMs = this.inactivitySeconds * 1_000;
    const phaseGapMs = this.phaseGapSeconds * 1_000;

    // A manual encounter is created immediately when the user presses + New.
    // Do not pollute its zero-length waiting state with unrelated aura/heal lines.
    if (this.current?.manual && this.current.hostileEvents === 0 && !hostile) {
      return;
    }

    if (this.current && hostile && !this.current.manual) {
      const hostileGap = event.timestamp - this.current.lastHostileAt;
      if (
        this.current.kind === "aoe" &&
        this.current.hostileEvents > 0 &&
        hostileGap > phaseGapMs
      ) {
        this.endCurrent();
      } else if (
        this.current.kind === "boss" &&
        hostileGap > phaseGapMs &&
        hostileGap <= inactivityMs &&
        isDamageToCreature(event) &&
        !this.belongsToCurrentBossEncounter(event, this.current)
      ) {
        this.endCurrent();
      } else if (hostileGap > inactivityMs) {
        this.endCurrent();
      }
    } else if (
      this.current &&
      !this.current.manual &&
      event.timestamp - this.current.lastHostileAt > inactivityMs
    ) {
      if (hostile) this.endCurrent();
      else return;
    }

    if (!this.current) {
      if (!hostile) return;
      this.markPreviousBossFailedOnReengage(event);
      this.current = this.createEncounter(event.timestamp, false);
    }

    // The placeholder uses wall-clock time only to make the row visible. Reset
    // combat timing to the first actual hostile event when combat arrives.
    if (hostile && this.current.manual && this.current.hostileEvents === 0) {
      this.current.startedAt = event.timestamp;
      this.current.endedAt = event.timestamp;
      this.current.lastHostileAt = event.timestamp;
    }

    if (hostile) {
      this.ingestHostilePhase(event, this.current);
      this.ingestEncounterTarget(event, this.current);
      this.current.hostileEvents += 1;
      this.classifyEncounter(this.current, event);
    }

    this.current.merged.ingest(event);
    this.current.split.ingest(event);
    const activePhase = this.current.phases.at(-1);
    activePhase?.merged.ingest(event);
    activePhase?.split.ingest(event);
    if (hostile) {
      this.current.endedAt = Math.max(this.current.endedAt, event.timestamp);
    }

    if (hostile && !this.current.manual && this.isBossKill(event, this.current)) {
      this.current.result = "success";
      this.endCurrent(false);
    }
  }

  getSummaries(): EncounterSummary[] {
    return this.getAll().map((encounter) => this.toSummary(encounter));
  }

  getActiveCombatSeconds(): number {
    return this.getAll().reduce(
      (sum, encounter) =>
        sum + Math.max(0, (encounter.endedAt - encounter.startedAt) / 1_000),
      0,
    );
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
    this.endCurrent(false);
  }

  endCurrent(_applyFailCheck = true): void {
    if (!this.current) return;
    if (this.current.result === "active") {
      // Not every Neverwinter boss produces a reliable Kill flag. Treat an
      // automatically closed boss as neutral/ended first. If the same boss is
      // engaged again shortly afterwards, that previous attempt is converted
      // to FAIL by markPreviousBossFailedOnReengage().
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
      kind: "aoe",
      result: "active",
      manual,
    };
  }

  private ingestHostilePhase(
    event: CombatEvent,
    encounter: EncounterAccumulator,
  ): void {
    let phase = encounter.phases.at(-1);
    if (
      !phase ||
      event.timestamp - encounter.lastHostileAt > this.phaseGapSeconds * 1_000
    ) {
      const index = encounter.phases.length + 1;
      phase = {
        id: `${encounter.id}-phase-${index}`,
        index,
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
      amount: 0,
      hits: 0,
      firstSeenAt: event.timestamp,
      lastSeenAt: event.timestamp,
    };
    target.name = event.target.displayName;
    target.stableId = event.target.stableId;
    target.amount += amount;
    target.hits += 1;
    target.firstSeenAt = Math.min(target.firstSeenAt, event.timestamp);
    target.lastSeenAt = Math.max(target.lastSeenAt, event.timestamp);
    encounter.damageTargets.set(key, target);
  }

  private classifyEncounter(
    encounter: EncounterAccumulator,
    event: CombatEvent,
  ): void {
    if (encounter.kind === "boss" || encounter.manual) return;
    const targets = [...encounter.damageTargets.entries()];
    if (targets.length === 0) return;
    const totalDamage = targets.reduce((sum, [, target]) => sum + target.amount, 0);
    const totalHits = targets.reduce((sum, [, target]) => sum + target.hits, 0);
    if (totalDamage <= 0 || totalHits <= 0) return;

    const stableIdCounts = new Map<string, number>();
    for (const [, target] of targets) {
      stableIdCounts.set(
        target.stableId,
        (stableIdCounts.get(target.stableId) ?? 0) + 1,
      );
    }

    const durationMs = Math.max(1, event.timestamp - encounter.startedAt);
    const candidates = targets
      .map(([targetId, target]) => {
        const targetSpanMs = Math.max(0, target.lastSeenAt - target.firstSeenAt);
        const share = target.amount / totalDamage;
        const hitShare = target.hits / totalHits;
        const spanRatio = targetSpanMs / durationMs;
        const persistenceScore =
          spanRatio * 0.55 + Math.min(1, target.hits / 30) * 0.25 + hitShare * 0.2;
        return {
          targetId,
          target,
          targetSpanMs,
          share,
          hitShare,
          spanRatio,
          persistenceScore,
          uniqueArchetype: (stableIdCounts.get(target.stableId) ?? 0) === 1,
        };
      })
      .sort((left, right) => right.persistenceScore - left.persistenceScore);
    const candidate = candidates[0];
    if (!candidate || !candidate.uniqueArchetype) return;

    const durationSeconds = durationMs / 1_000;
    const targetSpanSeconds = candidate.targetSpanMs / 1_000;
    const secondLongestSpanMs = candidates
      .slice(1)
      .reduce((max, item) => Math.max(max, item.targetSpanMs), 0);
    const persistenceLeadSeconds =
      (candidate.targetSpanMs - secondLongestSpanMs) / 1_000;
    const otherTargets = candidates.slice(1).map((item) => item.target.amount);
    const medianOtherDamage = median(otherTargets);
    const damageLead =
      medianOtherDamage > 0 ? candidate.target.amount / medianOtherDamage : Infinity;
    const clearBossShape =
      candidate.share >= 0.58 ||
      (persistenceLeadSeconds >= 8 && damageLead >= 2.5) ||
      (durationSeconds >= 45 && persistenceLeadSeconds >= 6 && damageLead >= 2);
    const killBoost =
      hasKillFlag(event) &&
      event.target.kind === "creature" &&
      event.target.instanceId === candidate.targetId;

    // Prefer false negatives over false positives. A long-lived elite in a trash
    // pull must not become a boss unless it is clearly separated from the pack.
    const persistentBoss =
      durationSeconds >= 35 &&
      targetSpanSeconds >= 30 &&
      candidate.spanRatio >= 0.86 &&
      candidate.target.hits >= 28 &&
      encounter.hostileEvents >= 45 &&
      clearBossShape &&
      (candidate.share >= 0.36 || candidate.hitShare >= 0.42);
    const killedBossCandidate =
      killBoost &&
      durationSeconds >= 22 &&
      targetSpanSeconds >= 18 &&
      candidate.spanRatio >= 0.82 &&
      candidate.target.hits >= 18 &&
      clearBossShape &&
      (candidate.share >= 0.34 || candidate.hitShare >= 0.4);

    if (!persistentBoss && !killedBossCandidate) return;
    encounter.kind = "boss";
    encounter.bossTargetId = candidate.targetId;
    encounter.bossStableId = candidate.target.stableId;
    encounter.bossTargetName = candidate.target.name;
  }

  private markPreviousBossFailedOnReengage(event: CombatEvent): void {
    if (!isDamageToCreature(event) || event.target.kind !== "creature") return;
    const reengageWindowMs = 10 * 60 * 1_000;

    for (let index = this.completed.length - 1; index >= 0; index -= 1) {
      const encounter = this.completed[index];
      if (!encounter) continue;
      if (event.timestamp - encounter.endedAt > reengageWindowMs) break;
      if (
        encounter.kind === "boss" &&
        encounter.result === "ended" &&
        encounter.bossStableId === event.target.stableId
      ) {
        encounter.result = "fail";
        return;
      }
    }
  }

  private belongsToCurrentBossEncounter(
    event: CombatEvent,
    encounter: EncounterAccumulator,
  ): boolean {
    const target = event.target.kind === "creature" ? event.target : null;
    if (!target) return true;
    if (target.instanceId === encounter.bossTargetId) return true;
    if (encounter.damageTargets.has(target.instanceId)) return true;
    return [...encounter.damageTargets.values()].some(
      (known) => known.stableId === target.stableId,
    );
  }

  private isBossKill(
    event: CombatEvent,
    encounter: EncounterAccumulator,
  ): boolean {
    return (
      encounter.kind === "boss" &&
      Boolean(encounter.bossTargetId) &&
      event.target.kind === "creature" &&
      (event.target.instanceId === encounter.bossTargetId ||
        event.target.stableId === encounter.bossStableId) &&
      hasKillFlag(event)
    );
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
    const split = encounter.split.build(statisticsDuration, false, false);
    const waitingForCombat = encounter.manual && encounter.hostileEvents === 0;
    const primaryTarget =
      encounter.bossTargetName ??
      encounter.phases
        .flatMap((phase) => [...phase.targets.values()])
        .sort((left, right) => right.amount - left.amount)[0]?.name ??
      (waitingForCombat ? "Waiting for combat" : "Bilinmeyen hedef");
    const typeLabel = encounter.kind === "boss" ? "BOSS" : "AOE";
    const resultLabel = encounter.result === "fail" ? "FAIL · " : "";
    const manualLabel = encounter.manual ? "MANUAL · " : "";
    const activeLabel =
      encounter.manual && encounter.result === "active" ? "ACTIVE · " : "";
    const typePrefix = waitingForCombat ? "" : `${typeLabel} · `;

    return {
      id: encounter.id,
      index: encounter.index,
      startedAt: encounter.startedAt,
      endedAt: encounter.endedAt,
      durationSeconds,
      totalDamage: merged.totalDamage,
      totalHealing: merged.totalHealing,
      entityCount: merged.entities.length,
      primaryTarget: `${resultLabel}${manualLabel}${activeLabel}${typePrefix}${primaryTarget}`,
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

function hasKillFlag(event: CombatEvent): boolean {
  return event.flags.some((flag) => flag.toLocaleLowerCase("en-US") === "kill");
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
}

function toPhaseSummary(phase: PhaseAccumulator): PhaseSummary {
  const durationSeconds = Math.max(
    1,
    (phase.endedAt - phase.startedAt) / 1_000,
  );
  const merged = phase.merged.build(durationSeconds, false, false);
  const split = phase.split.build(durationSeconds, false, false);
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

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
  bossTargetName?: string;
  manual: boolean;
}

export class EncounterEngine {
  private readonly completed: EncounterAccumulator[] = [];
  private current: EncounterAccumulator | null = null;
  private forceManualNext = false;

  constructor(
    private readonly inactivitySeconds = 20,
    private readonly phaseGapSeconds = 6,
  ) {}

  ingest(event: CombatEvent): void {
    const hostile = isHostileCombatEvent(event);
    const inactivityMs = this.inactivitySeconds * 1_000;
    const phaseGapMs = this.phaseGapSeconds * 1_000;

    if (this.current && hostile && !this.current.manual) {
      const hostileGap = event.timestamp - this.current.lastHostileAt;
      if (
        this.current.kind === "aoe" &&
        this.current.hostileEvents > 0 &&
        hostileGap > phaseGapMs
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
      this.current = this.createEncounter(event.timestamp, this.forceManualNext);
      this.forceManualNext = false;
    }

    if (hostile) {
      this.ingestHostilePhase(event, this.current);
      this.ingestEncounterTarget(event, this.current);
      this.current.hostileEvents += 1;
      this.classifyEncounter(this.current, event);
    }

    // Keep contextual events such as healing, shielding and resource changes in
    // the active encounter, but do not let unrelated aura lines hold it open.
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
        sum +
        Math.max(1, (encounter.endedAt - encounter.startedAt) / 1_000),
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
    this.forceManualNext = true;
  }

  markCurrentFailed(): void {
    if (!this.current) return;
    this.current.result = "fail";
    this.endCurrent(false);
  }

  endCurrent(applyFailCheck = true): void {
    if (!this.current) return;
    if (this.current.result === "active") {
      this.current.result =
        applyFailCheck && this.current.kind === "boss" ? "fail" : "ended";
    }
    this.completed.push(this.current);
    this.current = null;
  }

  reset(): void {
    this.completed.length = 0;
    this.current = null;
    this.forceManualNext = false;
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
    const target = encounter.damageTargets.get(event.target.stableId) ?? {
      name: event.target.displayName,
      amount: 0,
      hits: 0,
      firstSeenAt: event.timestamp,
      lastSeenAt: event.timestamp,
    };
    target.name = event.target.displayName;
    target.amount += amount;
    target.hits += 1;
    target.firstSeenAt = Math.min(target.firstSeenAt, event.timestamp);
    target.lastSeenAt = Math.max(target.lastSeenAt, event.timestamp);
    encounter.damageTargets.set(event.target.stableId, target);
  }

  private classifyEncounter(
    encounter: EncounterAccumulator,
    event: CombatEvent,
  ): void {
    if (encounter.kind === "boss") return;
    const targets = [...encounter.damageTargets.entries()];
    if (targets.length === 0) return;
    const totalDamage = targets.reduce((sum, [, target]) => sum + target.amount, 0);
    const totalHits = targets.reduce((sum, [, target]) => sum + target.hits, 0);
    if (totalDamage <= 0 || totalHits <= 0) return;

    const durationMs = Math.max(1, event.timestamp - encounter.startedAt);
    const candidates = targets
      .map(([targetId, target]) => {
        const targetSpanMs = Math.max(0, target.lastSeenAt - target.firstSeenAt);
        const share = target.amount / totalDamage;
        const hitShare = target.hits / totalHits;
        const spanRatio = targetSpanMs / durationMs;
        const persistenceScore =
          spanRatio * 0.5 + Math.min(1, target.hits / 20) * 0.3 + hitShare * 0.2;
        return {
          targetId,
          target,
          targetSpanMs,
          share,
          hitShare,
          spanRatio,
          persistenceScore,
        };
      })
      .sort((left, right) => right.persistenceScore - left.persistenceScore);
    const candidate = candidates[0];
    if (!candidate) return;

    const durationSeconds = durationMs / 1_000;
    const targetSpanSeconds = candidate.targetSpanMs / 1_000;
    const killBoost =
      hasKillFlag(event) &&
      event.target.kind === "creature" &&
      event.target.stableId === candidate.targetId;

    // Bosses can have add waves. Persistence and repeated targeting therefore
    // matter more than requiring a very high single-target damage percentage.
    const persistentBoss =
      durationSeconds >= 10 &&
      targetSpanSeconds >= 8 &&
      candidate.spanRatio >= 0.72 &&
      candidate.target.hits >= 10 &&
      encounter.hostileEvents >= 15 &&
      (candidate.share >= 0.25 || candidate.hitShare >= 0.3);
    const killedBossCandidate =
      killBoost &&
      durationSeconds >= 5 &&
      targetSpanSeconds >= 4 &&
      candidate.spanRatio >= 0.65 &&
      candidate.target.hits >= 6 &&
      (candidate.share >= 0.18 || candidate.hitShare >= 0.25);

    if (!persistentBoss && !killedBossCandidate) return;
    encounter.kind = "boss";
    encounter.bossTargetId = candidate.targetId;
    encounter.bossTargetName = candidate.target.name;
  }

  private isBossKill(
    event: CombatEvent,
    encounter: EncounterAccumulator,
  ): boolean {
    return (
      encounter.kind === "boss" &&
      Boolean(encounter.bossTargetId) &&
      event.target.kind === "creature" &&
      event.target.stableId === encounter.bossTargetId &&
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
      1,
      (encounter.endedAt - encounter.startedAt) / 1_000,
    );
    const merged = encounter.merged.build(durationSeconds, false, false);
    const split = encounter.split.build(durationSeconds, false, false);
    const primaryTarget =
      encounter.bossTargetName ??
      encounter.phases
        .flatMap((phase) => [...phase.targets.values()])
        .sort((left, right) => right.amount - left.amount)[0]?.name ??
      "Bilinmeyen hedef";
    const typeLabel = encounter.kind === "boss" ? "BOSS" : "AOE";
    const resultLabel = encounter.result === "fail" ? "FAIL · " : "";
    const manualLabel = encounter.manual ? "MANUAL · " : "";

    return {
      id: encounter.id,
      index: encounter.index,
      startedAt: encounter.startedAt,
      endedAt: encounter.endedAt,
      durationSeconds,
      totalDamage: merged.totalDamage,
      totalHealing: merged.totalHealing,
      entityCount: merged.entities.length,
      primaryTarget: `${resultLabel}${manualLabel}${typeLabel} · ${primaryTarget}`,
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

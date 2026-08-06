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

interface EncounterAccumulator {
  id: string;
  index: number;
  startedAt: number;
  endedAt: number;
  lastHostileAt: number;
  merged: StatisticsAccumulator;
  split: StatisticsAccumulator;
  phases: PhaseAccumulator[];
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

    if (
      this.current &&
      event.timestamp - this.current.lastHostileAt > inactivityMs
    ) {
      if (hostile) this.endCurrent();
      else return;
    }

    if (!this.current) {
      if (!hostile) return;
      this.current = this.createEncounter(event.timestamp);
    }

    if (hostile) this.ingestHostilePhase(event, this.current);

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

  endCurrent(): void {
    if (!this.current) return;
    this.completed.push(this.current);
    this.current = null;
  }

  reset(): void {
    this.completed.length = 0;
    this.current = null;
  }

  private createEncounter(timestamp: number): EncounterAccumulator {
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
    const amount = isDamageToCreature(event) ? event.magnitude : 1;
    const target = phase.targets.get(enemy.stableId) ?? {
      name: enemy.displayName,
      amount: 0,
    };
    target.name = enemy.displayName;
    target.amount += amount;
    phase.targets.set(enemy.stableId, target);
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
    const primaryTarget = encounter.phases
      .flatMap((phase) => [...phase.targets.values()])
      .sort((left, right) => right.amount - left.amount)[0]?.name;

    return {
      id: encounter.id,
      index: encounter.index,
      startedAt: encounter.startedAt,
      endedAt: encounter.endedAt,
      durationSeconds,
      totalDamage: merged.totalDamage,
      totalHealing: merged.totalHealing,
      entityCount: merged.entities.length,
      primaryTarget: primaryTarget ?? "Bilinmeyen hedef",
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

import type {
  AbilitySummary,
  CombatEvent,
  CombatSnapshot,
  PlayerSummary,
  PowerCastEvent,
  TargetSummary,
} from "../shared/types";
import {
  isEnemyPowerObservation,
  isIgnoredCombatEvent,
  parseCombatLogLine,
} from "./combatLogParser";
import {
  buildEnemyPowerSummaries,
  LiveCastDetector,
  type PowerObservation,
} from "./cadenceDetector";
import { EncounterEngine } from "./encounterEngine";
import { StatisticsAccumulator } from "./statisticsEngine";

export class CombatAnalysisEngine {
  private totalLines = 0;
  private parsedLines = 0;
  private parseErrors = 0;
  private firstEventAt: number | null = null;
  private lastEventAt: number | null = null;
  private readonly mergedStatistics = new StatisticsAccumulator(false);
  private readonly splitStatistics = new StatisticsAccumulator(true);
  private readonly enemyObservations: PowerObservation[] = [];
  private cachedEnemyPowers: CombatSnapshot["enemyPowers"] = [];
  private cadenceDirty = true;
  private readonly encounterEngine = new EncounterEngine(20, 6);
  private readonly liveCastDetector = new LiveCastDetector(5);

  ingestLine(line: string): PowerCastEvent | null {
    this.totalLines += 1;
    const parsed = parseCombatLogLine(line, this.totalLines);
    if (!parsed.ok) {
      this.parseErrors += 1;
      return null;
    }

    this.parsedLines += 1;
    return this.ingestEvent(parsed.event);
  }

  ingestEvent(event: CombatEvent): PowerCastEvent | null {
    if (isIgnoredCombatEvent(event)) return null;

    this.firstEventAt =
      this.firstEventAt === null
        ? event.timestamp
        : Math.min(this.firstEventAt, event.timestamp);
    this.lastEventAt =
      this.lastEventAt === null
        ? event.timestamp
        : Math.max(this.lastEventAt, event.timestamp);

    this.mergedStatistics.ingest(event);
    this.splitStatistics.ingest(event);
    this.encounterEngine.ingest(event);

    if (!isEnemyPowerObservation(event)) return null;
    const observation: PowerObservation = {
      enemyId: event.owner.stableId,
      enemyName: event.owner.displayName,
      enemyInstanceId: event.owner.instanceId,
      abilityId: event.abilityId,
      abilityName: event.abilityName,
      occurredAt: event.timestamp,
    };
    this.enemyObservations.push(observation);
    this.cadenceDirty = true;
    return this.liveCastDetector.observe(observation);
  }

  snapshot(filePath: string, refreshCadence = true): CombatSnapshot {
    const activeCombatSeconds = Math.max(
      1,
      this.encounterEngine.getActiveCombatSeconds(),
    );
    const merged = this.mergedStatistics.build(activeCombatSeconds, false);
    const split = this.splitStatistics.build(activeCombatSeconds, false);
    const playerDetails = merged.entities
      .filter(
        (entity) => entity.kind === "player" && entity.outgoingDamage > 0,
      )
      .map(
        (entity) =>
          this.mergedStatistics.getEntityDetail(
            entity.entityId,
            activeCombatSeconds,
          ) ?? entity,
      );

    if (
      this.cachedEnemyPowers.length === 0 ||
      (refreshCadence && this.cadenceDirty)
    ) {
      this.cachedEnemyPowers = buildEnemyPowerSummaries(this.enemyObservations);
      this.cadenceDirty = false;
    }

    return {
      generatedAt: Date.now(),
      filePath,
      totalLines: this.totalLines,
      parsedLines: this.parsedLines,
      parseErrors: this.parseErrors,
      firstEventAt: this.firstEventAt,
      lastEventAt: this.lastEventAt,
      activeCombatSeconds,
      players: buildPlayers(playerDetails),
      targets: buildTargets(playerDetails, merged.totalDamage),
      entities: merged.entities,
      splitEntities: split.entities,
      deaths: merged.deaths,
      rawEvents: merged.rawEvents,
      enemyPowers: this.cachedEnemyPowers,
      encounters: this.encounterEngine.getSummaries(),
    };
  }

  endEncounter(): void {
    this.encounterEngine.endCurrent();
  }

  getEntityDetail(
    scopeId: string,
    splitPetDamage: boolean,
    entityId: string,
  ): CombatSnapshot["entities"][number] | null {
    if (scopeId === "all") {
      const durationSeconds = Math.max(
        1,
        this.encounterEngine.getActiveCombatSeconds(),
      );
      return (splitPetDamage
        ? this.splitStatistics
        : this.mergedStatistics
      ).getEntityDetail(entityId, durationSeconds);
    }
    return this.encounterEngine.getEntityDetail(
      scopeId,
      splitPetDamage,
      entityId,
    );
  }

  getRawEvents(scopeId: string): CombatSnapshot["rawEvents"] {
    return scopeId === "all"
      ? this.mergedStatistics.getRawEvents()
      : this.encounterEngine.getRawEvents(scopeId);
  }

  getScopeEntities(
    scopeId: string,
    splitPetDamage: boolean,
  ): CombatSnapshot["entities"] {
    if (scopeId === "all") {
      const durationSeconds = Math.max(
        1,
        this.encounterEngine.getActiveCombatSeconds(),
      );
      return (splitPetDamage
        ? this.splitStatistics
        : this.mergedStatistics
      ).getEntitySummaries(durationSeconds);
    }
    return this.encounterEngine.getEntitySummaries(
      scopeId,
      splitPetDamage,
    );
  }

  reset(): void {
    this.totalLines = 0;
    this.parsedLines = 0;
    this.parseErrors = 0;
    this.firstEventAt = null;
    this.lastEventAt = null;
    this.mergedStatistics.reset();
    this.splitStatistics.reset();
    this.enemyObservations.length = 0;
    this.cachedEnemyPowers = [];
    this.cadenceDirty = true;
    this.encounterEngine.reset();
    this.liveCastDetector.reset();
  }
}

function buildPlayers(entities: CombatSnapshot["entities"]): PlayerSummary[] {
  return entities
    .filter((entity) => entity.kind === "player" && entity.outgoingDamage > 0)
    .map((entity) => ({
      playerId: entity.entityId,
      name: entity.name,
      totalDamage: entity.outgoingDamage,
      dps: entity.combatDps,
      combatDps: entity.combatDps,
      encDps: entity.encDps,
      encHps: entity.encHps,
      activeSeconds: entity.activeSeconds,
      share: entity.damageShare,
      hits: entity.hits,
      criticalRate: entity.criticalRate,
      flankRate: entity.flankRate,
      maxHit: entity.maxHit,
      abilities: entity.outgoingDamagePowers.map(toAbilitySummary),
    }))
    .sort((left, right) => right.totalDamage - left.totalDamage);
}

function toAbilitySummary(
  power: CombatSnapshot["entities"][number]["outgoingDamagePowers"][number],
): AbilitySummary {
  return {
    abilityId: power.powerId,
    name: power.name,
    damage: power.amount,
    share: power.share,
    hits: power.hits,
    criticalRate: power.criticalRate,
    flankRate: power.flankRate,
    maxHit: power.maxHit,
  };
}

function buildTargets(
  entities: CombatSnapshot["entities"],
  totalDamage: number,
): TargetSummary[] {
  const targets = new Map<string, { name: string; damage: number }>();
  for (const entity of entities) {
    if (entity.kind !== "player") continue;
    for (const target of entity.singleTargetDamage) {
      const total = targets.get(target.entityId) ?? {
        name: target.name,
        damage: 0,
      };
      total.name = target.name;
      total.damage += target.amount;
      targets.set(target.entityId, total);
    }
  }
  return [...targets.entries()]
    .map(([targetId, target]) => ({
      targetId,
      name: target.name,
      damage: target.damage,
      share: totalDamage > 0 ? target.damage / totalDamage : 0,
    }))
    .sort((left, right) => right.damage - left.damage);
}

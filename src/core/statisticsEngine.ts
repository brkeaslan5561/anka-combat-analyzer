import type {
  AnalysisEntityKind,
  CombatEntity,
  CombatEvent,
  DeathSummary,
  EntityAnalysis,
  IndividualHit,
  PowerBreakdown,
  RawEventSummary,
  TargetBreakdown,
} from "../shared/types";
import {
  DAMAGE_EFFECT_TYPES,
  isHealingEvent,
  isIgnoredCombatEvent,
  isMitigationEvent,
  isResourceEvent,
} from "./combatLogParser";

const ACTIVITY_GAP_MS = 20_000;
const DEFAULT_MAX_ENTITY_HITS = 20_000;
const MAX_RAW_EVENTS = 1_500;

interface ActivityAccumulator {
  segmentStartedAt: number | null;
  lastActiveAt: number | null;
  completedSeconds: number;
}

interface PowerAccumulator {
  key: string;
  powerId: string;
  name: string;
  type: string;
  sourceId?: string;
  sourceName?: string;
  targetId?: string;
  targetName?: string;
  amount: number;
  netAmount: number;
  baseAmount: number;
  hits: number;
  swings: number;
  criticalHits: number;
  flankHits: number;
  flankAmount: number;
  deflectHits: number;
  values: number[];
}

interface TargetAccumulator {
  entityId: string;
  name: string;
  amount: number;
  hits: number;
  maxHit: number;
}

interface EntityAccumulator {
  entityId: string;
  stableId: string;
  instanceId: string;
  name: string;
  baseName: string;
  kind: AnalysisEntityKind;
  isPet: boolean;
  ownerPlayerId?: string;
  ownerName?: string;
  firstSeenAt: number;
  lastSeenAt: number;
  activity: ActivityAccumulator;
  outgoingDamage: number;
  outgoingHealing: number;
  incomingDamage: number;
  incomingHealing: number;
  mitigation: number;
  actionPoints: number;
  hits: number;
  swings: number;
  healingHits: number;
  healingCriticalHits: number;
  incomingHits: number;
  incomingDeflectHits: number;
  incomingMaxHit: number;
  mitigationEvents: number;
  mitigationMaxHit: number;
  actionPointEvents: number;
  actionPointNet: number;
  actionPointMax: number;
  criticalHits: number;
  flankHits: number;
  flankDamage: number;
  deflectHits: number;
  kills: number;
  deaths: number;
  maxHit: number;
  outgoingDamagePowers: Map<string, PowerAccumulator>;
  outgoingHealingPowers: Map<string, PowerAccumulator>;
  incomingDamagePowers: Map<string, PowerAccumulator>;
  incomingHealingPowers: Map<string, PowerAccumulator>;
  mitigationPowers: Map<string, PowerAccumulator>;
  actionPointDetails: Map<string, PowerAccumulator>;
  targets: Map<string, TargetAccumulator>;
  individualOutHits: IndividualHit[];
  individualInHits: IndividualHit[];
}

interface PetOwner {
  playerId: string;
  name: string;
}

export interface BuiltStatistics {
  entities: EntityAnalysis[];
  deaths: DeathSummary[];
  rawEvents: RawEventSummary[];
  totalDamage: number;
  totalHealing: number;
}

/**
 * Collects ACT-style aggregate statistics for one analysis scope. Two instances
 * are used for every scope: owner-merged damage and source/pet-split damage.
 */
export class StatisticsAccumulator {
  private readonly entities = new Map<string, EntityAccumulator>();
  private readonly petOwners = new Map<string, PetOwner>();
  private readonly deaths: DeathSummary[] = [];
  private readonly rawEvents: RawEventSummary[] = [];

  constructor(
    private readonly splitPetDamage: boolean,
    private readonly maxEntityHits = DEFAULT_MAX_ENTITY_HITS,
  ) {}

  ingest(event: CombatEvent): void {
    if (isIgnoredCombatEvent(event)) return;

    this.registerPetOwner(event);
    const owner = this.ensureEntity(event.owner, event.timestamp);
    const source = this.ensureEntity(event.source, event.timestamp);
    const target = this.ensureEntity(event.target, event.timestamp);
    this.pushRawEvent(event);

    const actor = this.resolveActor(event, owner, source);
    if (!actor) return;

    if (DAMAGE_EFFECT_TYPES.has(event.effectType) && event.magnitude >= 0) {
      this.ingestDamage(event, actor, target);
      return;
    }

    if (isHealingEvent(event)) {
      this.ingestHealing(event, actor, target);
      return;
    }

    if (isMitigationEvent(event)) {
      this.ingestMitigation(event, actor, target);
      return;
    }

    if (isResourceEvent(event)) {
      this.ingestResource(event, actor);
    }
  }

  build(
    durationSeconds: number,
    includeDetails = true,
    includeRawEvents = true,
  ): BuiltStatistics {
    const safeDuration = Math.max(1, durationSeconds);
    const values = [...this.entities.values()].filter(hasEntityActivity);
    const partyEntities = values.filter(
      (entity) => entity.kind === "player" || entity.kind === "pet",
    );
    const totalDamage = partyEntities.reduce(
      (sum, entity) => sum + entity.outgoingDamage,
      0,
    );
    const totalHealing = partyEntities.reduce(
      (sum, entity) => sum + entity.outgoingHealing,
      0,
    );
    const totalDamageTaken = partyEntities.reduce(
      (sum, entity) => sum + entity.incomingDamage,
      0,
    );

    return {
      entities: values
        .map((entity) =>
          this.buildEntity(
            entity,
            safeDuration,
            totalDamage,
            totalHealing,
            totalDamageTaken,
            includeDetails,
          ),
        )
        .sort(compareEntities),
      deaths: [...this.deaths].sort(
        (left, right) => right.timestamp - left.timestamp,
      ),
      rawEvents: includeRawEvents ? [...this.rawEvents].reverse() : [],
      totalDamage,
      totalHealing,
    };
  }

  reset(): void {
    this.entities.clear();
    this.petOwners.clear();
    this.deaths.length = 0;
    this.rawEvents.length = 0;
  }

  getEntityDetail(
    entityId: string,
    durationSeconds: number,
  ): EntityAnalysis | null {
    const entity = this.entities.get(entityId);
    if (!entity) return null;
    const values = [...this.entities.values()].filter(hasEntityActivity);
    const partyEntities = values.filter(
      (item) => item.kind === "player" || item.kind === "pet",
    );
    const totalDamage = partyEntities.reduce(
      (sum, item) => sum + item.outgoingDamage,
      0,
    );
    const totalHealing = partyEntities.reduce(
      (sum, item) => sum + item.outgoingHealing,
      0,
    );
    const totalDamageTaken = partyEntities.reduce(
      (sum, item) => sum + item.incomingDamage,
      0,
    );
    return this.buildEntity(
      entity,
      Math.max(1, durationSeconds),
      totalDamage,
      totalHealing,
      totalDamageTaken,
      true,
    );
  }

  getRawEvents(): RawEventSummary[] {
    return [...this.rawEvents].reverse();
  }

  getEntitySummaries(durationSeconds: number): EntityAnalysis[] {
    return this.build(durationSeconds, false, false).entities;
  }

  private ingestDamage(
    event: CombatEvent,
    actor: EntityAccumulator,
    target: EntityAccumulator | null,
  ): void {
    const amount = Math.max(0, event.magnitude);
    this.touch(actor, event.timestamp);

    actor.swings += 1;
    if (amount > 0) {
      actor.outgoingDamage += amount;
      actor.hits += 1;
      actor.criticalHits += hasFlag(event, "Critical") ? 1 : 0;
      actor.flankHits += hasFlag(event, "Flank") ? 1 : 0;
      actor.flankDamage += hasFlag(event, "Flank") ? amount : 0;
      actor.deflectHits += isDeflected(event) ? 1 : 0;
      actor.maxHit = Math.max(actor.maxHit, amount);
    }

    const outKey = powerAggregationKey(event);
    addPowerEvent(
      actor.outgoingDamagePowers,
      outKey,
      event,
      amount,
      actor,
      target,
    );

    if (target) {
      if (amount > 0) {
        target.incomingDamage += amount;
        target.incomingHits += 1;
        target.incomingDeflectHits += isDeflected(event) ? 1 : 0;
        target.incomingMaxHit = Math.max(target.incomingMaxHit, amount);
      }
      const inKey = powerAggregationKey(event, actor.entityId);
      addPowerEvent(
        target.incomingDamagePowers,
        inKey,
        event,
        amount,
        actor,
        target,
      );
    }

    if (amount <= 0 || !target) return;
    const targetTotal = actor.targets.get(target.entityId) ?? {
      entityId: target.entityId,
      name: target.name,
      amount: 0,
      hits: 0,
      maxHit: 0,
    };
    targetTotal.name = target.name;
    targetTotal.amount += amount;
    targetTotal.hits += 1;
    targetTotal.maxHit = Math.max(targetTotal.maxHit, amount);
    actor.targets.set(target.entityId, targetTotal);

    const hit = makeHit(event, actor, target, amount);
    pushCapped(actor.individualOutHits, hit, this.maxEntityHits);
    pushCapped(target.individualInHits, hit, this.maxEntityHits);

    if (hasFlag(event, "Kill")) {
      actor.kills += 1;
      target.deaths += 1;
      this.deaths.push({
        id: `death-${event.lineNumber}`,
        timestamp: event.timestamp,
        victimId: target.entityId,
        victimName: target.name,
        killerId: actor.entityId,
        killerName: actor.name,
        powerName: event.abilityName,
        amount,
      });
    }
  }

  private ingestHealing(
    event: CombatEvent,
    actor: EntityAccumulator,
    target: EntityAccumulator | null,
  ): void {
    const amount = Math.abs(event.magnitude);
    actor.outgoingHealing += amount;
    actor.healingHits += 1;
    actor.healingCriticalHits += hasFlag(event, "Critical") ? 1 : 0;
    addPowerEvent(
      actor.outgoingHealingPowers,
      powerAggregationKey(event),
      event,
      amount,
      actor,
      target,
    );

    if (!target) return;
    target.incomingHealing += amount;
    addPowerEvent(
      target.incomingHealingPowers,
      powerAggregationKey(event, actor.entityId),
      event,
      amount,
      actor,
      target,
    );
  }

  private ingestMitigation(
    event: CombatEvent,
    actor: EntityAccumulator,
    target: EntityAccumulator | null,
  ): void {
    if (!target) return;
    const amount = Math.abs(event.magnitude);
    this.touch(actor, event.timestamp);
    target.mitigation += amount;
    target.mitigationEvents += 1;
    target.mitigationMaxHit = Math.max(target.mitigationMaxHit, amount);
    addPowerEvent(
      target.mitigationPowers,
      powerAggregationKey(event, actor.entityId),
      event,
      amount,
      actor,
      target,
    );
  }

  private ingestResource(
    event: CombatEvent,
    actor: EntityAccumulator,
  ): void {
    const amount = Math.abs(event.magnitude);
    actor.actionPoints += amount;
    actor.actionPointEvents += 1;
    actor.actionPointNet += event.magnitude;
    actor.actionPointMax = Math.max(actor.actionPointMax, amount);
    addPowerEvent(
      actor.actionPointDetails,
      powerAggregationKey(event),
      event,
      amount,
      actor,
      null,
    );
  }

  private registerPetOwner(event: CombatEvent): void {
    if (
      event.owner.kind !== "player" ||
      event.source.kind !== "creature" ||
      !isCompanion(event.source)
    ) {
      return;
    }
    this.petOwners.set(event.source.instanceId, {
      playerId: event.owner.stableId,
      name: event.owner.displayName,
    });
    this.migrateLegacyCompanion(event.source);
    const existing =
      this.entities.get(this.getEntityKey(event.source)) ??
      this.entities.get(event.source.instanceId);
    if (existing) this.applyPetMetadata(existing, event.source);
  }

  private resolveActor(
    event: CombatEvent,
    owner: EntityAccumulator | null,
    source: EntityAccumulator | null,
  ): EntityAccumulator | null {
    if (!this.splitPetDamage) {
      const knownPet = source?.isPet ? source : owner?.isPet ? owner : null;
      if (knownPet?.ownerPlayerId) {
        const playerOwner = this.entities.get(knownPet.ownerPlayerId);
        if (playerOwner) return playerOwner;
      }
    }

    if (event.owner.kind === "player") {
      if (
        this.splitPetDamage &&
        event.source.kind === "creature" &&
        isCompanion(event.source)
      ) {
        return source ?? owner;
      }
      return owner ?? source;
    }
    if (event.owner.kind === "creature") return owner ?? source;
    return source ?? owner;
  }

  private ensureEntity(
    entity: CombatEntity,
    timestamp: number,
  ): EntityAccumulator | null {
    if (entity.kind === "unknown") return null;
    const entityId = this.getEntityKey(entity);
    const existing = this.entities.get(entityId);
    if (existing) {
      existing.firstSeenAt = Math.min(existing.firstSeenAt, timestamp);
      existing.lastSeenAt = Math.max(existing.lastSeenAt, timestamp);
      existing.baseName = entity.displayName || existing.baseName;
      if (entity.kind === "creature" && this.petOwners.has(entity.instanceId)) {
        this.applyPetMetadata(existing, entity);
      }
      return existing;
    }

    const petOwner =
      entity.kind === "creature"
        ? this.petOwners.get(entity.instanceId)
        : undefined;
    const isPet = petOwner !== undefined;
    const accumulator: EntityAccumulator = {
      entityId,
      stableId: entity.stableId,
      instanceId: entity.instanceId,
      name: formatEntityName(entity, petOwner),
      baseName: entity.displayName,
      kind:
        entity.kind === "player"
          ? "player"
          : isPet
            ? "pet"
            : "enemy",
      isPet,
      ownerPlayerId: petOwner?.playerId,
      ownerName: petOwner?.name,
      firstSeenAt: timestamp,
      lastSeenAt: timestamp,
      activity: {
        segmentStartedAt: null,
        lastActiveAt: null,
        completedSeconds: 0,
      },
      outgoingDamage: 0,
      outgoingHealing: 0,
      incomingDamage: 0,
      incomingHealing: 0,
      mitigation: 0,
      actionPoints: 0,
      hits: 0,
      swings: 0,
      healingHits: 0,
      healingCriticalHits: 0,
      incomingHits: 0,
      incomingDeflectHits: 0,
      incomingMaxHit: 0,
      mitigationEvents: 0,
      mitigationMaxHit: 0,
      actionPointEvents: 0,
      actionPointNet: 0,
      actionPointMax: 0,
      criticalHits: 0,
      flankHits: 0,
      flankDamage: 0,
      deflectHits: 0,
      kills: 0,
      deaths: 0,
      maxHit: 0,
      outgoingDamagePowers: new Map(),
      outgoingHealingPowers: new Map(),
      incomingDamagePowers: new Map(),
      incomingHealingPowers: new Map(),
      mitigationPowers: new Map(),
      actionPointDetails: new Map(),
      targets: new Map(),
      individualOutHits: [],
      individualInHits: [],
    };
    this.entities.set(entityId, accumulator);
    return accumulator;
  }

  private getEntityKey(entity: CombatEntity): string {
    if (entity.kind === "player") return entity.stableId;
    if (entity.kind === "creature" && this.splitPetDamage) {
      const petOwner = this.petOwners.get(entity.instanceId);
      if (petOwner) {
        const sourceName =
          entity.displayName.trim().toLocaleLowerCase("tr-TR") ||
          entity.stableId;
        return `pet:${petOwner.playerId}:source:${sourceName}`;
      }
    }
    return entity.instanceId;
  }

  private applyPetMetadata(
    accumulator: EntityAccumulator,
    entity: CombatEntity,
  ): void {
    const owner = this.petOwners.get(entity.instanceId);
    if (!owner) return;
    accumulator.kind = "pet";
    accumulator.isPet = true;
    accumulator.ownerPlayerId = owner.playerId;
    accumulator.ownerName = owner.name;
    accumulator.name = formatEntityName(entity, owner);
  }

  private migrateLegacyCompanion(entity: CombatEntity): void {
    const legacyKey = entity.instanceId;
    const companionKey = this.getEntityKey(entity);
    if (legacyKey === companionKey) return;

    const legacy = this.entities.get(legacyKey);
    if (!legacy) return;

    const companion = this.entities.get(companionKey);
    this.entities.delete(legacyKey);
    if (!companion) {
      legacy.entityId = companionKey;
      this.entities.set(companionKey, legacy);
      return;
    }

    mergeEntityAccumulators(companion, legacy, this.maxEntityHits);
  }

  private touch(entity: EntityAccumulator, timestamp: number): void {
    const activity = entity.activity;
    if (
      activity.segmentStartedAt === null ||
      activity.lastActiveAt === null
    ) {
      activity.segmentStartedAt = timestamp;
      activity.lastActiveAt = timestamp;
      return;
    }
    if (timestamp - activity.lastActiveAt > ACTIVITY_GAP_MS) {
      activity.completedSeconds += Math.max(
        1,
        (activity.lastActiveAt - activity.segmentStartedAt) / 1_000,
      );
      activity.segmentStartedAt = timestamp;
    }
    activity.lastActiveAt = Math.max(activity.lastActiveAt, timestamp);
  }

  private buildEntity(
    entity: EntityAccumulator,
    durationSeconds: number,
    totalDamage: number,
    totalHealing: number,
    totalDamageTaken: number,
    includeDetails: boolean,
  ): EntityAnalysis {
    const activeSeconds = getActiveSeconds(entity.activity);
    return {
      entityId: entity.entityId,
      stableId: entity.stableId,
      instanceId: entity.instanceId,
      name: entity.name,
      baseName: entity.baseName,
      kind: entity.kind,
      isPet: entity.isPet,
      ownerPlayerId: entity.ownerPlayerId,
      ownerName: entity.ownerName,
      firstSeenAt: entity.firstSeenAt,
      lastSeenAt: entity.lastSeenAt,
      activeSeconds,
      outgoingDamage: entity.outgoingDamage,
      outgoingHealing: entity.outgoingHealing,
      incomingDamage: entity.incomingDamage,
      incomingHealing: entity.incomingHealing,
      mitigation: entity.mitigation,
      actionPoints: entity.actionPoints,
      damageShare: totalDamage > 0 ? entity.outgoingDamage / totalDamage : 0,
      healingShare:
        totalHealing > 0 ? entity.outgoingHealing / totalHealing : 0,
      damageTakenShare:
        totalDamageTaken > 0 ? entity.incomingDamage / totalDamageTaken : 0,
      combatDps: entity.outgoingDamage / activeSeconds,
      encDps: entity.outgoingDamage / durationSeconds,
      combatHps: entity.outgoingHealing / activeSeconds,
      encHps: entity.outgoingHealing / durationSeconds,
      hits: entity.hits,
      swings: entity.swings,
      healingHits: entity.healingHits,
      healingCriticalRate:
        entity.healingHits > 0
          ? entity.healingCriticalHits / entity.healingHits
          : 0,
      incomingHits: entity.incomingHits,
      incomingDeflectRate:
        entity.incomingHits > 0
          ? entity.incomingDeflectHits / entity.incomingHits
          : 0,
      incomingMaxHit: entity.incomingMaxHit,
      mitigationEvents: entity.mitigationEvents,
      mitigationMaxHit: entity.mitigationMaxHit,
      actionPointEvents: entity.actionPointEvents,
      actionPointNet: entity.actionPointNet,
      actionPointMax: entity.actionPointMax,
      hitRate: entity.swings > 0 ? entity.hits / entity.swings : 0,
      criticalRate:
        entity.hits > 0 ? entity.criticalHits / entity.hits : 0,
      flankRate: entity.hits > 0 ? entity.flankHits / entity.hits : 0,
      flankDamageRate:
        entity.outgoingDamage > 0
          ? entity.flankDamage / entity.outgoingDamage
          : 0,
      deflectRate:
        entity.hits > 0 ? entity.deflectHits / entity.hits : 0,
      kills: entity.kills,
      deaths: entity.deaths,
      maxHit: entity.maxHit,
      outgoingDamagePowers: includeDetails
        ? buildPowers(
            entity.outgoingDamagePowers,
            entity.outgoingDamage,
            activeSeconds,
            durationSeconds,
          )
        : [],
      outgoingHealingPowers: includeDetails
        ? buildPowers(
            entity.outgoingHealingPowers,
            entity.outgoingHealing,
            activeSeconds,
            durationSeconds,
          )
        : [],
      incomingDamagePowers: includeDetails
        ? buildPowers(
            entity.incomingDamagePowers,
            entity.incomingDamage,
            activeSeconds,
            durationSeconds,
          )
        : [],
      incomingHealingPowers: includeDetails
        ? buildPowers(
            entity.incomingHealingPowers,
            entity.incomingHealing,
            activeSeconds,
            durationSeconds,
          )
        : [],
      mitigationPowers: includeDetails
        ? buildPowers(
            entity.mitigationPowers,
            entity.mitigation,
            activeSeconds,
            durationSeconds,
          )
        : [],
      actionPointDetails: includeDetails
        ? buildPowers(
            entity.actionPointDetails,
            entity.actionPoints,
            activeSeconds,
            durationSeconds,
          )
        : [],
      singleTargetDamage: includeDetails
        ? buildTargets(entity.targets, entity.outgoingDamage)
        : [],
      individualOutHits: includeDetails
        ? [...entity.individualOutHits].sort(
            (left, right) => right.timestamp - left.timestamp,
          )
        : [],
      individualInHits: includeDetails
        ? [...entity.individualInHits].sort(
            (left, right) => right.timestamp - left.timestamp,
          )
        : [],
    };
  }

  private pushRawEvent(event: CombatEvent): void {
    this.rawEvents.push({
      lineNumber: event.lineNumber,
      timestamp: event.timestamp,
      ownerName: event.owner.displayName,
      sourceName: event.source.displayName,
      targetName: event.target.displayName,
      abilityName: event.abilityName,
      abilityId: event.abilityId,
      effectType: event.effectType,
      flags: event.flags,
      magnitude: event.magnitude,
      baseMagnitude: event.baseMagnitude,
    });
    if (this.rawEvents.length > MAX_RAW_EVENTS + 100) {
      this.rawEvents.splice(0, 100);
    }
  }
}

function addPowerEvent(
  map: Map<string, PowerAccumulator>,
  key: string,
  event: CombatEvent,
  amount: number,
  source: EntityAccumulator,
  target: EntityAccumulator | null,
): void {
  const power = map.get(key) ?? {
    key,
    powerId: event.abilityId,
    name: event.abilityName,
    type: event.effectType,
    sourceId: source.entityId,
    sourceName: source.name,
    targetId: target?.entityId,
    targetName: target?.name,
    amount: 0,
    netAmount: 0,
    baseAmount: 0,
    hits: 0,
    swings: 0,
    criticalHits: 0,
    flankHits: 0,
    flankAmount: 0,
    deflectHits: 0,
    values: [],
  };
  power.sourceName = source.name;
  power.targetName = target?.name;
  power.amount += amount;
  power.netAmount += event.magnitude;
  power.baseAmount += Math.abs(event.baseMagnitude);
  power.swings += 1;
  if (amount > 0) {
    power.hits += 1;
    power.criticalHits += hasFlag(event, "Critical") ? 1 : 0;
    power.flankHits += hasFlag(event, "Flank") ? 1 : 0;
    power.flankAmount += hasFlag(event, "Flank") ? amount : 0;
    power.deflectHits += isDeflected(event) ? 1 : 0;
    power.values.push(amount);
  }
  map.set(key, power);
}

function mergeEntityAccumulators(
  target: EntityAccumulator,
  source: EntityAccumulator,
  maximumHits: number,
): void {
  target.firstSeenAt = Math.min(target.firstSeenAt, source.firstSeenAt);
  target.lastSeenAt = Math.max(target.lastSeenAt, source.lastSeenAt);
  target.activity.completedSeconds += getTrackedSeconds(source.activity);

  const additiveFields: Array<keyof EntityAccumulator> = [
    "outgoingDamage",
    "outgoingHealing",
    "incomingDamage",
    "incomingHealing",
    "mitigation",
    "actionPoints",
    "hits",
    "swings",
    "healingHits",
    "healingCriticalHits",
    "incomingHits",
    "incomingDeflectHits",
    "mitigationEvents",
    "actionPointEvents",
    "actionPointNet",
    "criticalHits",
    "flankHits",
    "flankDamage",
    "deflectHits",
    "kills",
    "deaths",
  ];
  for (const field of additiveFields) {
    (target[field] as number) += source[field] as number;
  }

  target.incomingMaxHit = Math.max(
    target.incomingMaxHit,
    source.incomingMaxHit,
  );
  target.mitigationMaxHit = Math.max(
    target.mitigationMaxHit,
    source.mitigationMaxHit,
  );
  target.actionPointMax = Math.max(target.actionPointMax, source.actionPointMax);
  target.maxHit = Math.max(target.maxHit, source.maxHit);

  mergePowerMaps(target.outgoingDamagePowers, source.outgoingDamagePowers);
  mergePowerMaps(target.outgoingHealingPowers, source.outgoingHealingPowers);
  mergePowerMaps(target.incomingDamagePowers, source.incomingDamagePowers);
  mergePowerMaps(target.incomingHealingPowers, source.incomingHealingPowers);
  mergePowerMaps(target.mitigationPowers, source.mitigationPowers);
  mergePowerMaps(target.actionPointDetails, source.actionPointDetails);

  for (const [key, sourceTarget] of source.targets) {
    const current = target.targets.get(key);
    if (!current) {
      target.targets.set(key, sourceTarget);
      continue;
    }
    current.amount += sourceTarget.amount;
    current.hits += sourceTarget.hits;
    current.maxHit = Math.max(current.maxHit, sourceTarget.maxHit);
  }
  for (const hit of source.individualOutHits) {
    hit.sourceId = target.entityId;
    pushCapped(target.individualOutHits, hit, maximumHits);
  }
  for (const hit of source.individualInHits) {
    hit.targetId = target.entityId;
    pushCapped(target.individualInHits, hit, maximumHits);
  }
}

function mergePowerMaps(
  target: Map<string, PowerAccumulator>,
  source: Map<string, PowerAccumulator>,
): void {
  for (const [key, sourcePower] of source) {
    const power = target.get(key);
    if (!power) {
      target.set(key, sourcePower);
      continue;
    }
    power.amount += sourcePower.amount;
    power.netAmount += sourcePower.netAmount;
    power.baseAmount += sourcePower.baseAmount;
    power.hits += sourcePower.hits;
    power.swings += sourcePower.swings;
    power.criticalHits += sourcePower.criticalHits;
    power.flankHits += sourcePower.flankHits;
    power.flankAmount += sourcePower.flankAmount;
    power.deflectHits += sourcePower.deflectHits;
    power.values.push(...sourcePower.values);
  }
}

function getTrackedSeconds(activity: ActivityAccumulator): number {
  if (activity.segmentStartedAt === null || activity.lastActiveAt === null) {
    return activity.completedSeconds;
  }
  return (
    activity.completedSeconds +
    Math.max(0, activity.lastActiveAt - activity.segmentStartedAt) / 1_000
  );
}

function buildPowers(
  map: Map<string, PowerAccumulator>,
  total: number,
  activeSeconds: number,
  durationSeconds: number,
): PowerBreakdown[] {
  return [...map.values()]
    .map((power) => {
      const sorted = [...power.values].sort((left, right) => left - right);
      return {
        key: power.key,
        powerId: power.powerId,
        name: power.name,
        type: power.type,
        sourceId: power.sourceId,
        sourceName: power.sourceName,
        targetId: power.targetId,
        targetName: power.targetName,
        amount: power.amount,
        netAmount: power.netAmount,
        share: total > 0 ? power.amount / total : 0,
        combatDps: power.amount / activeSeconds,
        encDps: power.amount / durationSeconds,
        average: power.hits > 0 ? power.amount / power.hits : 0,
        median: median(sorted),
        minHit: sorted[0] ?? 0,
        maxHit: sorted.at(-1) ?? 0,
        hits: power.hits,
        swings: power.swings,
        hitRate: power.swings > 0 ? power.hits / power.swings : 0,
        criticalRate:
          power.hits > 0 ? power.criticalHits / power.hits : 0,
        flankRate: power.hits > 0 ? power.flankHits / power.hits : 0,
        flankDamageRate:
          power.amount > 0 ? power.flankAmount / power.amount : 0,
        deflectRate:
          power.hits > 0 ? power.deflectHits / power.hits : 0,
        effectiveness:
          power.baseAmount > 0 ? power.amount / power.baseAmount : 0,
      };
    })
    .sort((left, right) => right.amount - left.amount);
}

function buildTargets(
  map: Map<string, TargetAccumulator>,
  total: number,
): TargetBreakdown[] {
  return [...map.values()]
    .map((target) => ({
      entityId: target.entityId,
      name: target.name,
      amount: target.amount,
      share: total > 0 ? target.amount / total : 0,
      hits: target.hits,
      average: target.hits > 0 ? target.amount / target.hits : 0,
      maxHit: target.maxHit,
    }))
    .sort((left, right) => right.amount - left.amount);
}

function makeHit(
  event: CombatEvent,
  source: EntityAccumulator,
  target: EntityAccumulator,
  amount: number,
): IndividualHit {
  return {
    id: `hit-${event.lineNumber}-${source.entityId}-${target.entityId}`,
    lineNumber: event.lineNumber,
    timestamp: event.timestamp,
    sourceId: source.entityId,
    sourceName: source.name,
    targetId: target.entityId,
    targetName: target.name,
    powerId: event.abilityId,
    powerName: event.abilityName,
    type: event.effectType,
    amount,
    baseAmount: event.baseMagnitude,
    flags: event.flags,
  };
}

function getActiveSeconds(activity: ActivityAccumulator): number {
  if (
    activity.segmentStartedAt === null ||
    activity.lastActiveAt === null
  ) {
    return 1;
  }
  return Math.max(
    1,
    activity.completedSeconds +
      (activity.lastActiveAt - activity.segmentStartedAt) / 1_000,
  );
}

function formatEntityName(entity: CombatEntity, owner?: PetOwner): string {
  if (entity.kind === "player") return entity.displayName;
  if (owner) return `${entity.displayName} [${owner.name}'s Pet]`;
  return entity.instanceNumber
    ? `${entity.displayName} [${entity.instanceNumber}]`
    : entity.displayName;
}

function isCompanion(entity: CombatEntity): boolean {
  const archetype = entity.archetype ?? "";
  return archetype.startsWith("Pet_");
}

function powerAggregationKey(
  event: CombatEvent,
  sourceId?: string,
): string {
  const name = event.abilityName
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en-US");
  return sourceId ? `${sourceId}|${name}` : name;
}

function isDeflected(event: CombatEvent): boolean {
  return (
    hasFlag(event, "Dodge") ||
    hasFlag(event, "ReactiveDodge") ||
    hasFlag(event, "Deflect")
  );
}

function hasFlag(event: CombatEvent, flag: string): boolean {
  return event.flags.includes(flag);
}

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function pushCapped<T>(values: T[], value: T, maximum: number): void {
  values.push(value);
  if (values.length > maximum + 25) values.splice(0, 25);
}

function compareEntities(left: EntityAnalysis, right: EntityAnalysis): number {
  const kindOrder: Record<AnalysisEntityKind, number> = {
    player: 0,
    pet: 1,
    enemy: 2,
    other: 3,
  };
  const kindDifference = kindOrder[left.kind] - kindOrder[right.kind];
  if (kindDifference !== 0) return kindDifference;
  const activityLeft =
    left.outgoingDamage + left.incomingDamage + left.outgoingHealing;
  const activityRight =
    right.outgoingDamage + right.incomingDamage + right.outgoingHealing;
  if (activityLeft !== activityRight) return activityRight - activityLeft;
  return left.name.localeCompare(right.name, "tr");
}

function hasEntityActivity(entity: EntityAccumulator): boolean {
  return (
    entity.outgoingDamage > 0 ||
    entity.outgoingHealing > 0 ||
    entity.incomingDamage > 0 ||
    entity.incomingHealing > 0 ||
    entity.mitigation > 0 ||
    entity.actionPoints > 0
  );
}

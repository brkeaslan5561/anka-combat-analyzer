export type EntityKind = "player" | "creature" | "unknown";

export interface CombatEntity {
  kind: EntityKind;
  displayName: string;
  rawId: string;
  stableId: string;
  instanceId: string;
  instanceNumber?: string;
  archetype?: string;
  characterId?: string;
  accountId?: string;
}

export interface CombatEvent {
  lineNumber: number;
  timestamp: number;
  timestampText: string;
  owner: CombatEntity;
  source: CombatEntity;
  target: CombatEntity;
  abilityName: string;
  abilityId: string;
  effectType: string;
  flags: string[];
  magnitude: number;
  baseMagnitude: number;
}

export interface AbilitySummary {
  abilityId: string;
  name: string;
  damage: number;
  share: number;
  hits: number;
  criticalRate: number;
  flankRate: number;
  maxHit: number;
}

export interface PlayerSummary {
  playerId: string;
  name: string;
  totalDamage: number;
  /** Backwards-compatible alias for combatDps. */
  dps: number;
  combatDps: number;
  encDps: number;
  encHps: number;
  activeSeconds: number;
  share: number;
  hits: number;
  criticalRate: number;
  flankRate: number;
  maxHit: number;
  abilities: AbilitySummary[];
}

export interface TargetSummary {
  targetId: string;
  name: string;
  damage: number;
  share: number;
}

export type AnalysisEntityKind = "player" | "pet" | "enemy" | "other";

export interface PowerBreakdown {
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
  share: number;
  combatDps: number;
  encDps: number;
  average: number;
  median: number;
  minHit: number;
  maxHit: number;
  hits: number;
  swings: number;
  hitRate: number;
  criticalRate: number;
  flankRate: number;
  flankDamageRate: number;
  deflectRate: number;
  effectiveness: number;
}

export interface TargetBreakdown {
  entityId: string;
  name: string;
  amount: number;
  share: number;
  hits: number;
  average: number;
  maxHit: number;
}

export interface IndividualHit {
  id: string;
  lineNumber: number;
  timestamp: number;
  sourceId: string;
  sourceName: string;
  targetId: string;
  targetName: string;
  powerId: string;
  powerName: string;
  type: string;
  amount: number;
  baseAmount: number;
  flags: string[];
}

export interface DeathSummary {
  id: string;
  timestamp: number;
  victimId: string;
  victimName: string;
  killerId: string;
  killerName: string;
  powerName: string;
  amount: number;
}

export interface RawEventSummary {
  lineNumber: number;
  timestamp: number;
  ownerName: string;
  sourceName: string;
  targetName: string;
  abilityName: string;
  abilityId: string;
  effectType: string;
  flags: string[];
  magnitude: number;
  baseMagnitude: number;
}

export interface EntityAnalysis {
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
  activeSeconds: number;
  outgoingDamage: number;
  outgoingHealing: number;
  incomingDamage: number;
  incomingHealing: number;
  mitigation: number;
  actionPoints: number;
  damageShare: number;
  healingShare: number;
  damageTakenShare: number;
  combatDps: number;
  encDps: number;
  combatHps: number;
  encHps: number;
  hits: number;
  swings: number;
  healingHits: number;
  healingCriticalRate: number;
  incomingHits: number;
  incomingDeflectRate: number;
  incomingMaxHit: number;
  mitigationEvents: number;
  mitigationMaxHit: number;
  actionPointEvents: number;
  actionPointNet: number;
  actionPointMax: number;
  hitRate: number;
  criticalRate: number;
  flankRate: number;
  flankDamageRate: number;
  deflectRate: number;
  kills: number;
  deaths: number;
  maxHit: number;
  outgoingDamagePowers: PowerBreakdown[];
  outgoingHealingPowers: PowerBreakdown[];
  incomingDamagePowers: PowerBreakdown[];
  incomingHealingPowers: PowerBreakdown[];
  mitigationPowers: PowerBreakdown[];
  actionPointDetails: PowerBreakdown[];
  singleTargetDamage: TargetBreakdown[];
  individualOutHits: IndividualHit[];
  individualInHits: IndividualHit[];
}

export interface PhaseSummary {
  id: string;
  index: number;
  startedAt: number;
  endedAt: number;
  durationSeconds: number;
  primaryTarget: string;
  totalDamage: number;
  totalHealing: number;
  entityCount: number;
  mergedEntities: EntityAnalysis[];
  splitEntities: EntityAnalysis[];
  deaths: DeathSummary[];
  rawEvents: RawEventSummary[];
}

export type CadenceClassification =
  | "high"
  | "medium"
  | "variable"
  | "insufficient";

export interface CadenceFinding {
  key: string;
  enemyId: string;
  enemyName: string;
  abilityId: string;
  abilityName: string;
  estimatedIntervalSeconds: number | null;
  medianAbsoluteDeviationSeconds: number | null;
  intervalCount: number;
  instanceCount: number;
  directMatchRate: number;
  multipleMatchRate: number;
  confidence: number;
  classification: CadenceClassification;
  observedRangeSeconds: [number, number] | null;
}

export interface EnemyPowerSummary {
  key: string;
  enemyId: string;
  enemyName: string;
  abilityId: string;
  abilityName: string;
  rawEventCount: number;
  castCount: number;
  firstSeenAt: number;
  lastSeenAt: number;
  cadence: CadenceFinding;
}

export interface EncounterSummary {
  id: string;
  index: number;
  startedAt: number;
  endedAt: number;
  durationSeconds: number;
  totalDamage: number;
  totalHealing: number;
  entityCount: number;
  primaryTarget: string;
  phases: PhaseSummary[];
  mergedEntities: EntityAnalysis[];
  splitEntities: EntityAnalysis[];
  deaths: DeathSummary[];
  rawEvents: RawEventSummary[];
  playerDamage: Array<{
    playerId: string;
    name: string;
    damage: number;
    dps: number;
    combatDps: number;
    encDps: number;
  }>;
}

export interface CombatSnapshot {
  generatedAt: number;
  filePath: string;
  totalLines: number;
  parsedLines: number;
  parseErrors: number;
  firstEventAt: number | null;
  lastEventAt: number | null;
  activeCombatSeconds: number;
  players: PlayerSummary[];
  targets: TargetSummary[];
  entities: EntityAnalysis[];
  splitEntities: EntityAnalysis[];
  deaths: DeathSummary[];
  rawEvents: RawEventSummary[];
  enemyPowers: EnemyPowerSummary[];
  encounters: EncounterSummary[];
}

export interface PowerCastEvent {
  key: string;
  enemyId: string;
  enemyName: string;
  enemyInstanceId: string;
  abilityId: string;
  abilityName: string;
  occurredAt: number;
}

export interface TimerRule {
  id: string;
  contentName: string;
  difficulty: string;
  enemyId: string;
  enemyName: string;
  abilityId: string;
  abilityName: string;
  intervalSeconds: number;
  warningSeconds: number;
  episodeGapSeconds: number;
  enabled: boolean;
  origin: "manual" | "automatic" | "community";
  confidence?: number;
  createdAt: number;
}

export interface ActiveTimerEvent {
  timerId: string;
  ruleId: string;
  label: string;
  enemyName: string;
  abilityName: string;
  durationSeconds: number;
  warningSeconds: number;
  startedAt: number;
}

export interface MonitorStatus {
  state: "idle" | "loading" | "live" | "error";
  filePath?: string;
  message: string;
  progress?: number;
}

export interface UpdateStatus {
  state: "current" | "available" | "error";
  currentVersion: string;
  latestVersion?: string;
  releaseName?: string;
  releaseUrl?: string;
  downloadUrl?: string;
  assetName?: string;
  message: string;
}

export interface UpdateDownloadResult {
  success: boolean;
  filePath?: string;
  message: string;
}

export interface AppSettings {
  logFilePath?: string;
  logDirectoryPath?: string;
  overlayEnabled: boolean;
  preferredPlayerId?: string;
  preferredPlayerName?: string;
  timerRules: TimerRule[];
}

export interface InitialAppState {
  settings: AppSettings;
  status: MonitorStatus;
  snapshot: CombatSnapshot | null;
}

export interface AnalyzerApi {
  selectLogFile(): Promise<string | null>;
  saveData(): Promise<string | null>;
  clearData(): Promise<void>;
  startNewEncounter(): Promise<void>;
  endEncounter(): Promise<void>;
  markEncounterFail(): Promise<void>;
  getEntityDetail(
    scopeId: string,
    splitPetDamage: boolean,
    entityId: string,
  ): Promise<EntityAnalysis | null>;
  getRawEvents(scopeId: string): Promise<RawEventSummary[]>;
  getScopeEntities(
    scopeId: string,
    splitPetDamage: boolean,
  ): Promise<EntityAnalysis[]>;
  getInitialState(): Promise<InitialAppState>;
  getTimerRules(): Promise<TimerRule[]>;
  saveTimerRule(rule: TimerRule): Promise<TimerRule[]>;
  deleteTimerRule(ruleId: string): Promise<TimerRule[]>;
  setPreferredPlayer(playerId: string, name: string): Promise<AppSettings>;
  toggleOverlay(): Promise<boolean>;
  setOverlayEnabled(enabled: boolean): Promise<boolean>;
  getUpdateStatus(): Promise<UpdateStatus>;
  downloadUpdate(): Promise<UpdateDownloadResult>;
  minimizeWindow(): Promise<void>;
  toggleMaximizeWindow(): Promise<boolean>;
  isWindowMaximized(): Promise<boolean>;
  closeWindow(): Promise<void>;
  onWindowMaximizedChanged(callback: (maximized: boolean) => void): () => void;
  onSnapshot(callback: (snapshot: CombatSnapshot) => void): () => void;
  onStatus(callback: (status: MonitorStatus) => void): () => void;
  onTimerStarted(callback: (event: ActiveTimerEvent) => void): () => void;
}

declare global {
  interface Window {
    analyzer: AnalyzerApi;
  }
}

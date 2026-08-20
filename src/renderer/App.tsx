import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import packageJson from "../../package.json";
import type {
  CombatSnapshot,
  DeathSummary,
  EnemyPowerSummary,
  EntityAnalysis,
  IndividualHit,
  MonitorStatus,
  PowerBreakdown,
  TimerRule,
} from "../shared/types";
import { createAggregateScopeId } from "../shared/analysisScope";
import {
  filterHitsForPowers,
  filterHitsForTarget,
} from "./detailFilters";

type MainTab =
  | "encounter"
  | "healing"
  | "tanking"
  | "mitigation"
  | "deaths"
  | "actionPoints"
  | "breakdown"
  | "enemyPowers"
  | "timers";

type DetailTab =
  | "outgoingDamage"
  | "outgoingHealing"
  | "incomingDamage"
  | "incomingHealing"
  | "singleTargetDamage"
  | "individualOutHits"
  | "individualInHits"
  | "actionPointDetails"
  | "encounters";

type EntityKindFilter = "all" | "player" | "pet" | "enemy";

interface ScopeView {
  id: string;
  label: string;
  startedAt: number | null;
  endedAt: number | null;
  durationSeconds: number;
  totalDamage: number;
  totalHealing: number;
  entities: EntityAnalysis[];
  deaths: DeathSummary[];
  encounterIds: string[];
}

type ScopeSelection =
  | { kind: "all" }
  | { kind: "encounter"; encounterId: string }
  | { kind: "run"; runId: string }
  | { kind: "selection"; encounterIds: string[] };

const HIDDEN_ENCOUNTER_STORAGE_PREFIX = "anka:hidden-encounters:";

const ANALYSIS_TABS: Array<{ id: MainTab; label: string }> = [
  { id: "encounter", label: "Encounter" },
  { id: "healing", label: "Healing" },
  { id: "tanking", label: "Tanking" },
  { id: "mitigation", label: "Mitigation" },
  { id: "deaths", label: "Deaths" },
  { id: "actionPoints", label: "Action Points" },
  { id: "breakdown", label: "Breakdown" },
];

const DETAIL_TABS: Array<{ id: DetailTab; label: string }> = [
  { id: "outgoingDamage", label: "Damage Done" },
  { id: "outgoingHealing", label: "Healing Done" },
  { id: "incomingDamage", label: "Damage Taken" },
  { id: "incomingHealing", label: "Healing Received" },
  { id: "singleTargetDamage", label: "Targets" },
  { id: "individualOutHits", label: "Out Hits" },
  { id: "individualInHits", label: "In Hits" },
  { id: "actionPointDetails", label: "Resources" },
  { id: "encounters", label: "Encounters" },
];

const EMPTY_STATUS: MonitorStatus = {
  state: "idle",
  message: "Combatlog seçilmedi",
};

export function App() {
  const [snapshot, setSnapshot] = useState<CombatSnapshot | null>(null);
  const [status, setStatus] = useState<MonitorStatus>(EMPTY_STATUS);
  const [rules, setRules] = useState<TimerRule[]>([]);
  const [tab, setTab] = useState<MainTab>("encounter");
  const [lastAnalysisTab, setLastAnalysisTab] = useState<MainTab>("encounter");
  const [detailTab, setDetailTab] = useState<DetailTab>("outgoingDamage");
  const [scopeSelection, setScopeSelection] = useState<ScopeSelection>({ kind: "all" });
  const [checkedEncounterIds, setCheckedEncounterIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [hiddenEncounterIds, setHiddenEncounterIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [sidebarSplitPercent, setSidebarSplitPercent] = useState(72);
  const [selectedEntityId, setSelectedEntityId] = useState<string>();
  const [selectedDetail, setSelectedDetail] = useState<EntityAnalysis | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [remoteScope, setRemoteScope] = useState<{
    scopeId: string;
    splitPetDamage: boolean;
    entities: EntityAnalysis[];
  } | null>(null);
  const [preferredPlayerId, setPreferredPlayerId] = useState<string>();
  const [splitPetDamage, setSplitPetDamage] = useState(false);
  const [overlayEnabled, setOverlayEnabled] = useState(false);
  const [entitySearch, setEntitySearch] = useState("");
  const [entityKindFilter, setEntityKindFilter] =
    useState<EntityKindFilter>("all");
  const [enemySearch, setEnemySearch] = useState("");
  const [stableOnly, setStableOnly] = useState(true);

  useEffect(() => {
    let mounted = true;
    void window.analyzer.getInitialState().then((state) => {
      if (!mounted) return;
      setSnapshot(state.snapshot);
      setStatus(state.status);
      setRules(state.settings.timerRules);
      setPreferredPlayerId(state.settings.preferredPlayerId);
      setOverlayEnabled(state.settings.overlayEnabled);
    });
    const unsubscribeSnapshot = window.analyzer.onSnapshot(setSnapshot);
    const unsubscribeStatus = window.analyzer.onStatus(setStatus);
    return () => {
      mounted = false;
      unsubscribeSnapshot();
      unsubscribeStatus();
    };
  }, []);

  useEffect(() => {
    setCheckedEncounterIds(new Set());
    setScopeSelection({ kind: "all" });
    if (!snapshot) {
      setHiddenEncounterIds(new Set());
      return;
    }
    const known = new Set(snapshot.encounters.map((item) => item.id));
    setHiddenEncounterIds(
      new Set(readHiddenEncounterIds(snapshot.filePath).filter((id) => known.has(id))),
    );
  }, [snapshot?.filePath]);

  const visibleEncounters = useMemo(
    () =>
      snapshot?.encounters.filter((item) => !hiddenEncounterIds.has(item.id)) ?? [],
    [hiddenEncounterIds, snapshot],
  );

  const scopedEncounterIds = useMemo(() => {
    if (!snapshot) return [];
    if (scopeSelection.kind === "all") {
      return visibleEncounters.map((item) => item.id);
    }
    if (scopeSelection.kind === "encounter") {
      return hiddenEncounterIds.has(scopeSelection.encounterId)
        ? []
        : [scopeSelection.encounterId];
    }
    if (scopeSelection.kind === "run") {
      const run = snapshot.runs.find((item) => item.id === scopeSelection.runId);
      return (run?.encounterIds ?? []).filter((id) => !hiddenEncounterIds.has(id));
    }
    return scopeSelection.encounterIds.filter(
      (id) => !hiddenEncounterIds.has(id),
    );
  }, [hiddenEncounterIds, scopeSelection, snapshot, visibleEncounters]);

  const selectedScopeId = useMemo(() => {
    if (scopeSelection.kind === "encounter" && scopedEncounterIds[0]) {
      return scopedEncounterIds[0];
    }
    if (
      scopeSelection.kind === "all" &&
      snapshot &&
      scopedEncounterIds.length === snapshot.encounters.length
    ) {
      return "all";
    }
    return createAggregateScopeId(
      scopedEncounterIds,
      scopeSelection.kind === "selection" ? "sum" : "elapsed",
    );
  }, [scopeSelection, scopedEncounterIds, snapshot]);

  useEffect(() => {
    if (scopeSelection.kind !== "all" && scopedEncounterIds.length === 0) {
      setScopeSelection({ kind: "all" });
    }
  }, [scopeSelection.kind, scopedEncounterIds.length]);

  useEffect(() => {
    if (!snapshot) return;
    let cancelled = false;
    void window.analyzer
      .getScopeEntities(selectedScopeId, splitPetDamage)
      .then((entities) => {
        if (cancelled) return;
        setRemoteScope({
          scopeId: selectedScopeId,
          splitPetDamage,
          entities,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [selectedScopeId, snapshot?.generatedAt, splitPetDamage]);

  const scope = useMemo(
    () =>
      snapshot
        ? buildScope(
            snapshot,
            scopeSelection,
            scopedEncounterIds,
            selectedScopeId,
            splitPetDamage,
            remoteScope?.scopeId === selectedScopeId &&
              remoteScope.splitPetDamage === splitPetDamage
              ? remoteScope.entities
              : [],
          )
        : null,
    [remoteScope, scopeSelection, scopedEncounterIds, selectedScopeId, snapshot, splitPetDamage],
  );

  useEffect(() => {
    if (!scope?.entities.length) return;
    if (
      selectedEntityId &&
      scope.entities.some((entity) => entity.entityId === selectedEntityId)
    ) {
      return;
    }
    const preferred =
      scope.entities.find(
        (entity) => entity.entityId === preferredPlayerId,
      ) ??
      scope.entities.find(
        (entity) => entity.baseName.toLocaleLowerCase("tr-TR") === "opop",
      ) ??
      scope.entities.find((entity) => entity.kind === "player") ??
      scope.entities[0];
    setSelectedEntityId(preferred?.entityId);
  }, [preferredPlayerId, scope, selectedEntityId]);

  const selectedSummary =
    scope?.entities.find((entity) => entity.entityId === selectedEntityId) ??
    null;

  useEffect(() => {
    if (
      tab !== "breakdown" ||
      !scope ||
      !selectedEntityId
    ) {
      return;
    }
    let cancelled = false;
    setSelectedDetail(null);
    setDetailLoading(true);
    void window.analyzer
      .getEntityDetail(scope.id, splitPetDamage, selectedEntityId)
      .then((detail) => {
        if (cancelled) return;
        setSelectedDetail(detail);
        setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scope?.id, selectedEntityId, snapshot?.generatedAt, splitPetDamage, tab]);

  const selectedEntity =
    selectedDetail?.entityId === selectedSummary?.entityId
      ? selectedDetail
      : selectedSummary;

  const filteredEntities = useMemo(() => {
    if (!scope) return [];
    const query = entitySearch.trim().toLocaleLowerCase("tr-TR");
    return scope.entities.filter((entity) => {
      const hasActivity =
        entity.outgoingDamage > 0 ||
        entity.incomingDamage > 0 ||
        entity.outgoingHealing > 0 ||
        entity.incomingHealing > 0 ||
        entity.mitigation > 0 ||
        entity.actionPoints > 0;
      const matchesKind =
        entityKindFilter === "all" || entity.kind === entityKindFilter;
      return (
        hasActivity &&
        matchesKind &&
        `${entity.name} ${entity.baseName}`
          .toLocaleLowerCase("tr-TR")
          .includes(query)
      );
    });
  }, [entityKindFilter, entitySearch, scope]);

  const filteredEnemyPowers = useMemo(() => {
    if (!snapshot) return [];
    const query = enemySearch.trim().toLocaleLowerCase("tr-TR");
    return snapshot.enemyPowers.filter((power) => {
      const stable = ["high", "medium"].includes(
        power.cadence.classification,
      );
      return (
        (!stableOnly || stable) &&
        `${power.enemyName} ${power.abilityName} ${power.enemyId}`
          .toLocaleLowerCase("tr-TR")
          .includes(query)
      );
    });
  }, [enemySearch, snapshot, stableOnly]);

  const selectAnalysisTab = (nextTab: MainTab) => {
    setTab(nextTab);
    setLastAnalysisTab(nextTab);
  };

  const chooseEntity = (entity: EntityAnalysis) => {
    setSelectedEntityId(entity.entityId);
    setDetailTab("outgoingDamage");
    selectAnalysisTab("breakdown");
    if (entity.kind === "player") {
      setPreferredPlayerId(entity.entityId);
      void window.analyzer.setPreferredPlayer(entity.entityId, entity.baseName);
    }
  };

  const selectEncounter = (id: string) => {
    setScopeSelection(
      id === "all"
        ? { kind: "all" }
        : { kind: "encounter", encounterId: id },
    );
  };

  const toggleEncounterChecked = (id: string) => {
    setCheckedEncounterIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const mergeCheckedEncounters = () => {
    const encounterIds = visibleEncounters
      .map((item) => item.id)
      .filter((id) => checkedEncounterIds.has(id));
    if (encounterIds.length === 0) return;
    setScopeSelection({ kind: "selection", encounterIds });
  };

  const deleteEncounter = (id: string) => {
    if (!snapshot) return;
    const encounter = snapshot.encounters.find((item) => item.id === id);
    if (!encounter) return;
    if (
      !window.confirm(
        `Remove this encounter from every analysis scope?\n\n${encounter.index}. ${encounter.primaryTarget}`,
      )
    ) return;

    const next = new Set(hiddenEncounterIds);
    next.add(id);
    setHiddenEncounterIds(next);
    writeHiddenEncounterIds(snapshot.filePath, next);
    setCheckedEncounterIds((current) => {
      const checked = new Set(current);
      checked.delete(id);
      return checked;
    });
  };

  const restoreDeletedEncounters = () => {
    if (!snapshot) return;
    const empty = new Set<string>();
    setHiddenEncounterIds(empty);
    writeHiddenEncounterIds(snapshot.filePath, empty);
  };

  const saveSuggestedTimer = async (power: EnemyPowerSummary) => {
    if (!power.cadence.estimatedIntervalSeconds) return;
    const rule: TimerRule = {
      id: crypto.randomUUID(),
      contentName: inferContent(power.enemyId),
      difficulty: "Master",
      enemyId: power.enemyId,
      enemyName: power.enemyName,
      abilityId: power.abilityId,
      abilityName: power.abilityName,
      intervalSeconds: power.cadence.estimatedIntervalSeconds,
      warningSeconds: 5,
      episodeGapSeconds: 5,
      enabled: true,
      origin: "automatic",
      confidence: power.cadence.confidence,
      createdAt: Date.now(),
    };
    setRules(await window.analyzer.saveTimerRule(rule));
    setTab("timers");
  };

  const clearData = async () => {
    if (!window.confirm("Yüklenmiş analiz verisi temizlensin mi?")) return;
    setSnapshot(null);
    setScopeSelection({ kind: "all" });
    setCheckedEncounterIds(new Set());
    setHiddenEncounterIds(new Set());
    await window.analyzer.clearData();
  };

  const toggleOverlay = async () => {
    const enabled = await window.analyzer.toggleOverlay();
    setOverlayEnabled(enabled);
  };

  const isAnalysisView = tab !== "enemyPowers" && tab !== "timers";

  return (
    <div className="desktop-app">
      <header className="app-titlebar">
        <img className="app-emblem" src="./app-icon.png" alt="" aria-hidden="true" />
        <strong>Anka Combat Analyzer</strong>
        <span className={`titlebar-status ${status.state}`}>
          {statusLabel(status)}
        </span>
        <span className="titlebar-caption">
          {snapshot
            ? `${formatFileName(snapshot.filePath)} · Log Time: ${formatTime(snapshot.lastEventAt)}`
            : "No combatlog selected"}
        </span>
        <span className="titlebar-version">v{packageJson.version}</span>
      </header>

      <div className="toolbar-row">
        <nav className="workspace-nav" aria-label="Ana çalışma alanları">
          <button
            className={`workspace-button ${isAnalysisView ? "selected" : ""}`}
            onClick={() => setTab(lastAnalysisTab)}
          >
            <span>Combat Analysis</span>
          </button>
          <button
            className={`workspace-button ${tab === "enemyPowers" ? "selected" : ""}`}
            onClick={() => setTab("enemyPowers")}
          >
            <span>Enemy Powers</span>
          </button>
          <button
            className={`workspace-button ${tab === "timers" ? "selected" : ""}`}
            onClick={() => setTab("timers")}
          >
            <span>Timers</span>
          </button>
        </nav>

        <div className="header-actions">
          <button
            className="header-button primary"
            onClick={() => window.analyzer.selectLogFile()}
          >
            Load Log
          </button>
          <button
            className="header-button"
            disabled={!snapshot}
            onClick={() => window.analyzer.saveData()}
          >
            Export
          </button>
          <button
            className="header-button subtle"
            disabled={!snapshot}
            onClick={clearData}
          >
            Clear
          </button>
          <button
            className={`header-button ${overlayEnabled ? "active" : ""}`}
            onClick={toggleOverlay}
          >
            Overlay: {overlayEnabled ? "On" : "Off"}
          </button>
        </div>
      </div>

      {isAnalysisView && (
        <nav className="analysis-tabs" aria-label="Analiz kategorileri">
          <span className="analysis-tabs-label">Analysis</span>
          <div className="analysis-tab-list">
            {ANALYSIS_TABS.map((item) => (
              <button
                key={item.id}
                className={tab === item.id ? "selected" : ""}
                onClick={() => selectAnalysisTab(item.id)}
              >
                {item.label}
              </button>
            ))}
            <label className="analysis-pet-toggle" title="Companion damage is shown as separate entities when enabled">
              <input
                type="checkbox"
                checked={splitPetDamage}
                onChange={(event) => setSplitPetDamage(event.target.checked)}
              />
              <span>Split pets</span>
            </label>
          </div>
        </nav>
      )}

      {status.state === "loading" && (
        <div className="load-progress">
          <span style={{ width: `${Math.round((status.progress ?? 0) * 100)}%` }} />
        </div>
      )}

      {!snapshot || !scope ? (
        <NoData status={status} onLoad={() => window.analyzer.selectLogFile()} />
      ) : (
        <div className={`analyzer-workspace ${isAnalysisView ? "" : "wide"}`}>
          {isAnalysisView && (
            <aside className="scope-sidebar">
              <section
                className="encounter-browser"
                style={{ height: `${sidebarSplitPercent}%` }}
              >
                <div className="pane-title">
                  <span>Encounters</span>
                  <small>{visibleEncounters.length}</small>
                </div>
                <div className="encounter-selection-toolbar">
                  <button
                    disabled={checkedEncounterIds.size === 0}
                    onClick={mergeCheckedEncounters}
                    title="Show only the checked encounters as one combined scope"
                  >
                    Merge selected ({checkedEncounterIds.size})
                  </button>
                  {checkedEncounterIds.size > 0 && (
                    <button onClick={() => setCheckedEncounterIds(new Set())}>Clear</button>
                  )}
                  {hiddenEncounterIds.size > 0 && (
                    <button onClick={restoreDeletedEncounters}>Restore removed</button>
                  )}
                </div>
                <div className="encounter-tree">
                  <button
                    className={`tree-row root ${scopeSelection.kind === "all" ? "selected" : ""}`}
                    onClick={() => selectEncounter("all")}
                  >
                    <span className="tree-toggle">−</span>
                    <span>All Encounters</span>
                    <small>{formatDuration(scopeDuration(snapshot, visibleEncounters.map((item) => item.id), "elapsed"))}</small>
                  </button>
                  {snapshot.runs.map((run) => {
                    const encounters = visibleEncounters.filter(
                      (item) => item.runId === run.id,
                    );
                    if (encounters.length === 0) return null;
                    const selected =
                      scopeSelection.kind === "run" && scopeSelection.runId === run.id;
                    return (
                      <div className="run-group" key={run.id}>
                        <button
                          className={`tree-row run-row ${selected ? "selected" : ""}`}
                          onClick={() => setScopeSelection({ kind: "run", runId: run.id })}
                        >
                          <span className="tree-toggle">▾</span>
                          <span>Run {run.index}{run.contentKey ? ` · ${run.contentKey}` : ""}{run.active ? " · Active" : ""}</span>
                          <small>{formatDuration(scopeDuration(snapshot, encounters.map((item) => item.id), "elapsed"))}</small>
                        </button>
                        <div className="run-encounters">
                          {encounters.map((item) => (
                            <div className="tree-branch encounter-deletable" key={item.id}>
                              <label className="encounter-check" title="Include in a custom merged scope">
                                <input
                                  type="checkbox"
                                  checked={checkedEncounterIds.has(item.id)}
                                  onChange={() => toggleEncounterChecked(item.id)}
                                />
                              </label>
                              <button
                                className={`tree-row ${scopeSelection.kind === "encounter" && scopeSelection.encounterId === item.id ? "selected" : ""}`}
                                onClick={() => selectEncounter(item.id)}
                              >
                                <span className="tree-toggle">•</span>
                                <span>{item.index}. {item.primaryTarget}</span>
                                <small>{formatDuration(item.durationSeconds)}</small>
                              </button>
                              <button
                                className="encounter-delete-button"
                                title={`Remove ${item.index}. ${item.primaryTarget}`}
                                aria-label={`Remove encounter ${item.index}`}
                                onClick={() => deleteEncounter(item.id)}
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              <VerticalSplitter
                label="Resize encounters and entities"
                value={sidebarSplitPercent}
                onResize={setSidebarSplitPercent}
                minPercent={20}
                maxPercent={72}
              />

              <section className="entity-browser">
                <div className="pane-title entity-heading">
                  <span>Entities</span>
                  <small>{filteredEntities.length}</small>
                </div>
                <div className="entity-filter-tabs">
                  {(["all", "player", "pet", "enemy"] as EntityKindFilter[]).map(
                    (kind) => (
                      <button
                        key={kind}
                        className={entityKindFilter === kind ? "selected" : ""}
                        onClick={() => setEntityKindFilter(kind)}
                      >
                        {kind === "all"
                          ? "All"
                          : kind === "player"
                            ? "Players"
                            : kind === "pet"
                              ? "Pets"
                              : "Enemies"}
                      </button>
                    ),
                  )}
                </div>
                <label className="entity-search-box">
                  <span>⌕</span>
                  <input
                    value={entitySearch}
                    onChange={(event) => setEntitySearch(event.target.value)}
                    placeholder="Search entities"
                  />
                </label>
                <div className="entity-list">
                  {filteredEntities.map((entity) => (
                    <button
                      className={`entity-list-item ${selectedEntityId === entity.entityId ? "selected" : ""}`}
                      key={entity.entityId}
                      title={entityTypeLabel(entity)}
                      onClick={() => chooseEntity(entity)}
                    >
                      <span className={`entity-avatar ${entity.kind}`}>
                        {entity.baseName.slice(0, 1).toLocaleUpperCase("tr-TR")}
                      </span>
                      <span className="entity-copy">
                        <strong>{entity.name}</strong>
                        <small>{entityTypeLabel(entity)}</small>
                      </span>
                      <span className="entity-value">
                        {formatCompactNumber(
                          Math.max(entity.outgoingDamage, entity.incomingDamage),
                        )}
                      </span>
                    </button>
                  ))}
                  {filteredEntities.length === 0 && (
                    <div className="entity-list-empty">No matching entity</div>
                  )}
                </div>
              </section>
            </aside>
          )}

          <main className="analysis-pane">
            <AnalysisContent
              tab={tab}
              detailTab={detailTab}
              scope={scope}
              snapshot={snapshot}
              selectedEntity={selectedEntity}
              detailLoading={detailLoading}
              splitPetDamage={splitPetDamage}
              enemyPowers={filteredEnemyPowers}
              enemySearch={enemySearch}
              stableOnly={stableOnly}
              rules={rules}
              onSelectEntity={chooseEntity}
              onDetailTab={setDetailTab}
              onEnemySearch={setEnemySearch}
              onStableOnly={setStableOnly}
              onCreateTimer={saveSuggestedTimer}
              onSaveRule={async (rule) =>
                setRules(await window.analyzer.saveTimerRule(rule))
              }
              onDeleteRule={async (id) =>
                setRules(await window.analyzer.deleteTimerRule(id))
              }
            />
          </main>
        </div>
      )}
    </div>
  );
}

function AnalysisContent({
  tab,
  detailTab,
  scope,
  snapshot,
  selectedEntity,
  detailLoading,
  splitPetDamage,
  enemyPowers,
  enemySearch,
  stableOnly,
  rules,
  onSelectEntity,
  onDetailTab,
  onEnemySearch,
  onStableOnly,
  onCreateTimer,
  onSaveRule,
  onDeleteRule,
}: {
  tab: MainTab;
  detailTab: DetailTab;
  scope: ScopeView;
  snapshot: CombatSnapshot;
  selectedEntity: EntityAnalysis | null;
  detailLoading: boolean;
  splitPetDamage: boolean;
  enemyPowers: EnemyPowerSummary[];
  enemySearch: string;
  stableOnly: boolean;
  rules: TimerRule[];
  onSelectEntity: (entity: EntityAnalysis) => void;
  onDetailTab: (tab: DetailTab) => void;
  onEnemySearch: (value: string) => void;
  onStableOnly: (value: boolean) => void;
  onCreateTimer: (power: EnemyPowerSummary) => void;
  onSaveRule: (rule: TimerRule) => void;
  onDeleteRule: (id: string) => void;
}) {
  if (tab === "encounter") {
    return (
      <DamageRanking
        title="Encounter Summary"
        scope={scope}
        entities={partyEntities(scope.entities)}
        onSelect={onSelectEntity}
      />
    );
  }
  if (tab === "healing") {
    return <HealingTable entities={scope.entities} onSelect={onSelectEntity} />;
  }
  if (tab === "tanking") {
    return <TankingTable entities={scope.entities} onSelect={onSelectEntity} />;
  }
  if (tab === "mitigation") {
    return <MitigationTable entities={scope.entities} onSelect={onSelectEntity} />;
  }
  if (tab === "deaths") return <DeathsTable deaths={scope.deaths} entities={scope.entities} />;
  if (tab === "actionPoints") {
    return <ActionPointsTable entities={scope.entities} onSelect={onSelectEntity} />;
  }
  if (tab === "breakdown") {
    return selectedEntity ? (
      <EntityBreakdown
        entity={selectedEntity}
        scope={scope}
        tab={detailTab}
        loading={detailLoading}
        snapshot={snapshot}
        splitPetDamage={splitPetDamage}
        onTab={onDetailTab}
      />
    ) : (
      <TableEmpty text="Select an entity to open its breakdown." />
    );
  }
  if (tab === "enemyPowers") {
    return (
      <EnemyPowerTable
        powers={enemyPowers}
        search={enemySearch}
        stableOnly={stableOnly}
        rules={rules}
        onSearch={onEnemySearch}
        onStableOnly={onStableOnly}
        onCreateTimer={onCreateTimer}
      />
    );
  }
  return (
    <TimersPage
      powers={snapshot.enemyPowers}
      rules={rules}
      onSave={onSaveRule}
      onDelete={onDeleteRule}
    />
  );
}

function DamageRanking({
  title,
  scope,
  entities,
  onSelect,
}: {
  title: string;
  scope: ScopeView;
  entities: EntityAnalysis[];
  onSelect: (entity: EntityAnalysis) => void;
}) {
  const totalDamageTaken = entities.reduce(
    (sum, entity) => sum + entity.incomingDamage,
    0,
  );
  return (
    <TableSection title={title} subtitle={`${scope.label} · owner attribution`}>
      <table className="data-grid ranking-grid">
        <thead>
          <tr>
            <th>Name</th><th>Damage</th><th>%</th><th>combatDPS</th><th>EncDPS</th><th>Time</th>
            <th>Crit %</th><th className="optional-col">Flank %</th><th>Damage In</th><th>Kills</th><th>Deaths</th>
          </tr>
        </thead>
        <tbody>
          <tr className="aggregate-row">
            <td>All</td>
            <td>{formatNumber(scope.totalDamage)}</td><td>100,0%</td>
            <td>{formatNumber(scope.totalDamage / scope.durationSeconds)}</td>
            <td>{formatNumber(scope.totalDamage / scope.durationSeconds)}</td>
            <td>{formatDuration(scope.durationSeconds)}</td>
            <td>{formatRate(weightedRate(entities, "criticalRate", "hits"))}</td>
            <td className="optional-col">{formatRate(weightedRate(entities, "flankRate", "hits"))}</td>
            <td>{formatNumber(totalDamageTaken)}</td>
            <td>{entities.reduce((sum, entity) => sum + entity.kills, 0)}</td>
            <td>{entities.reduce((sum, entity) => sum + entity.deaths, 0)}</td>
          </tr>
          {entities.map((entity) => (
            <tr key={entity.entityId} onClick={() => onSelect(entity)}>
              <td className="name-cell"><strong>{entity.name}</strong><small>{entityTypeLabel(entity)}</small></td>
              <td>{formatNumber(entity.outgoingDamage)}</td>
              <td>{formatRate(entity.damageShare)}</td>
              <td>{formatNumber(entity.combatDps)}</td>
              <td>{formatNumber(entity.encDps)}</td>
              <td>{formatDuration(entity.activeSeconds)}</td>
              <td>{formatRate(entity.criticalRate)}</td>
              <td className="optional-col">{formatRate(entity.flankRate)}</td>
              <td>{formatNumber(entity.incomingDamage)}</td>
              <td>{entity.kills.toLocaleString("tr-TR")}</td>
              <td>{entity.deaths}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableSection>
  );
}

function HealingTable({ entities, onSelect }: EntityTableProps) {
  const rows = entities.filter((entity) => entity.outgoingHealing > 0).sort((a, b) => b.outgoingHealing - a.outgoingHealing);
  return (
    <TableSection title="Healing" subtitle="HitPoints effects; negative log values are normalized as healing">
      <table className="data-grid"><thead><tr><th>Name</th><th>Healing</th><th>%</th><th>combatHPS</th><th>EncHPS</th><th>Time</th><th>Crit %</th><th>Incoming Healing</th><th>Abilities</th></tr></thead>
        <tbody>{rows.map((entity) => <tr key={entity.entityId} onClick={() => onSelect(entity)}>
          <td className="name-cell"><strong>{entity.name}</strong><small>{entityTypeLabel(entity)}</small></td>
          <td>{formatNumber(entity.outgoingHealing)}</td><td>{formatRate(entity.healingShare)}</td><td>{formatNumber(entity.combatHps)}</td><td>{formatNumber(entity.encHps)}</td><td>{formatDuration(entity.activeSeconds)}</td>
          <td>{formatRate(entity.healingCriticalRate)}</td><td>{formatNumber(entity.incomingHealing)}</td><td>{entity.healingHits}</td>
        </tr>)}</tbody>
      </table>{rows.length === 0 && <TableEmpty text="No healing events in this scope." />}
    </TableSection>
  );
}

function TankingTable({ entities, onSelect }: EntityTableProps) {
  const rows = partyEntities(entities).filter((entity) => entity.incomingDamage > 0).sort((a, b) => b.incomingDamage - a.incomingDamage);
  const total = rows.reduce((sum, entity) => sum + entity.incomingDamage, 0);
  return (
    <TableSection title="Tanking / Incoming Damage" subtitle="Select an entity to see exactly which boss attacks hit it">
      <table className="data-grid"><thead><tr><th>Name</th><th>DamageTaken</th><th>%</th><th>Hits Taken</th><th>Average Hit</th><th>Max Hit</th><th>Deflect %</th><th>Mitigation</th><th>Deaths</th></tr></thead>
        <tbody>{rows.map((entity) => {
          const hits = entity.incomingHits;
          return <tr key={entity.entityId} onClick={() => onSelect(entity)}><td className="name-cell"><strong>{entity.name}</strong><small>{entityTypeLabel(entity)}</small></td>
            <td>{formatNumber(entity.incomingDamage)}</td><td>{formatRate(entity.incomingDamage / Math.max(1, total))}</td><td>{hits.toLocaleString("tr-TR")}</td><td>{formatNumber(entity.incomingDamage / Math.max(1, hits))}</td>
            <td>{formatNumber(entity.incomingMaxHit)}</td><td>{formatRate(entity.incomingDeflectRate)}</td><td>{formatNumber(entity.mitigation)}</td><td>{entity.deaths}</td></tr>;
        })}</tbody>
      </table>{rows.length === 0 && <TableEmpty text="No incoming damage in this scope." />}
    </TableSection>
  );
}

function MitigationTable({ entities, onSelect }: EntityTableProps) {
  const rows = entities.filter((entity) => entity.mitigation > 0).sort((a, b) => b.mitigation - a.mitigation);
  const total = rows.reduce((sum, entity) => sum + entity.mitigation, 0);
  return (
    <TableSection title="Mitigation" subtitle="Damage absorbed by Shield events">
      <table className="data-grid"><thead><tr><th>Name</th><th>Mitigated</th><th>%</th><th>Events</th><th>Average</th><th>Largest</th><th>Incoming Damage</th><th>Sources</th></tr></thead>
        <tbody>{rows.map((entity) => { const hits = entity.mitigationEvents; return <tr key={entity.entityId} onClick={() => onSelect(entity)}>
          <td className="name-cell"><strong>{entity.name}</strong><small>{entityTypeLabel(entity)}</small></td><td>{formatNumber(entity.mitigation)}</td><td>{formatRate(entity.mitigation / Math.max(1, total))}</td><td>{hits}</td><td>{formatNumber(entity.mitigation / Math.max(1, hits))}</td><td>{formatNumber(entity.mitigationMaxHit)}</td><td>{formatNumber(entity.incomingDamage)}</td><td>—</td>
        </tr>; })}</tbody>
      </table>{rows.length === 0 && <TableEmpty text="No shield mitigation events in this scope." />}
    </TableSection>
  );
}

function DeathsTable({ deaths, entities }: { deaths: DeathSummary[]; entities: EntityAnalysis[] }) {
  const playerIds = new Set(entities.filter((entity) => entity.kind === "player").map((entity) => entity.entityId));
  type DeathPowerRow = { enemy: string; power: string; count: number; victims: Map<string, number>; latest: number };
  const grouped = new Map<string, DeathPowerRow>();
  for (const death of deaths) {
    if (playerIds.size > 0 && !playerIds.has(death.victimId)) continue;
    const enemyType = death.killerName.replace(/\s+\[\d+\]\s*$/, "").trim() || "Unknown";
    const key = `${enemyType}|${death.powerName}`;
    const row = grouped.get(key) ?? { enemy: enemyType, power: death.powerName, count: 0, victims: new Map<string, number>(), latest: death.timestamp };
    row.count += 1;
    row.latest = Math.max(row.latest, death.timestamp);
    row.victims.set(death.victimName, (row.victims.get(death.victimName) ?? 0) + 1);
    grouped.set(key, row);
  }
  const enemyMap = new Map<string, { enemy: string; count: number; latest: number; powers: DeathPowerRow[] }>();
  for (const row of grouped.values()) {
    const enemy = enemyMap.get(row.enemy) ?? { enemy: row.enemy, count: 0, latest: row.latest, powers: [] };
    enemy.count += row.count;
    enemy.latest = Math.max(enemy.latest, row.latest);
    enemy.powers.push(row);
    enemyMap.set(row.enemy, enemy);
  }
  const enemyGroups = [...enemyMap.values()]
    .map((enemy) => ({ ...enemy, powers: enemy.powers.sort((left, right) => right.count - left.count || right.latest - left.latest) }))
    .sort((left, right) => left.enemy.localeCompare(right.enemy, "en", { sensitivity: "base", numeric: true }));
  const totalDeaths = enemyGroups.reduce((sum, enemy) => sum + enemy.count, 0);
  const maxPowerDeaths = Math.max(1, ...enemyGroups.flatMap((enemy) => enemy.powers.map((power) => power.count)));
  return (
    <div className="deaths-view">
      <div className="death-total-line" aria-label={`${totalDeaths} total deaths`}><span>Total deaths</span><strong>{totalDeaths}</strong></div>
      <TableSection
        title="Deaths by Enemy Type"
        subtitle="Enemy types sorted alphabetically; abilities ordered by fatal events"
      >
        <table className="data-grid deaths-grid">
          <thead><tr><th>Enemy Type</th><th>Fatal Ability</th><th>Deaths</th><th>Players Killed</th><th>Last</th></tr></thead>
          <tbody>{enemyGroups.flatMap((enemy) => enemy.powers.map((row, index) => {
            const victims = [...row.victims.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
            return <tr className={index === 0 ? "death-group-start" : ""} key={`${row.enemy}|${row.power}`}>
              {index === 0 && <td className="death-enemy-cell" rowSpan={enemy.powers.length}>
                <div className="death-enemy-card">
                  <strong>{enemy.enemy}</strong>
                  <small>{enemy.count} {enemy.count === 1 ? "death" : "deaths"}</small>
                  <span className="death-enemy-meter"><i style={{ width: `${enemy.count / Math.max(1, totalDeaths) * 100}%` }} /></span>
                </div>
              </td>}
              <td className="name-cell death-power-cell"><strong>{row.power}</strong></td>
              <td className="death-count-cell"><div className="death-count-visual"><span><i style={{ width: `${row.count / maxPowerDeaths * 100}%` }} /></span><b>{row.count}</b></div></td>
              <td className="death-victims-cell"><div className="death-victim-list">{victims.map(([name, count]) => <span className="death-victim-entry" key={name}><span>{name}</span>{count > 1 && <b>×{count}</b>}</span>)}</div></td>
              <td className="death-time-cell">{formatTime(row.latest)}</td>
            </tr>;
          }))}</tbody>
        </table>
        {enemyGroups.length === 0 && <TableEmpty text="No player deaths caused by enemy powers in this scope." />}
      </TableSection>
    </div>
  );
}

function ActionPointsTable({ entities, onSelect }: EntityTableProps) {
  const rows = entities.filter((entity) => entity.actionPoints > 0).sort((a, b) => b.actionPoints - a.actionPoints);
  return (
    <TableSection title="Action Points" subtitle="Power, Soulweave and Divinity resource changes recorded by Neverwinter">
      <table className="data-grid"><thead><tr><th>Name</th><th>Resource Activity</th><th>Net Change</th><th>Events</th><th>Average</th><th>Largest</th><th>Abilities</th></tr></thead>
        <tbody>{rows.map((entity) => { const events = entity.actionPointEvents; return <tr key={entity.entityId} onClick={() => onSelect(entity)}><td className="name-cell"><strong>{entity.name}</strong><small>{entityTypeLabel(entity)}</small></td><td>{formatDecimal(entity.actionPoints)}</td><td>{formatSigned(entity.actionPointNet)}</td><td>{events}</td><td>{formatDecimal(entity.actionPoints / Math.max(1, events))}</td><td>{formatDecimal(entity.actionPointMax)}</td><td>{events}</td></tr>; })}</tbody>
      </table>{rows.length === 0 && <TableEmpty text="No action/resource events in this scope." />}
    </TableSection>
  );
}

function EntityBreakdown({ entity, scope, tab, loading, snapshot, splitPetDamage, onTab }: { entity: EntityAnalysis; scope: ScopeView; tab: DetailTab; loading: boolean; snapshot: CombatSnapshot; splitPetDamage: boolean; onTab: (tab: DetailTab) => void }) {
  return (
    <section className="entity-detail">
      <nav className="detail-tabs" aria-label="Entity detail views">
        <span className="detail-entity-name" title={`${entityTypeLabel(entity)} · ${scope.label}`}><small>{entityTypeLabel(entity)}</small><strong>{entity.name}</strong></span>
        <div className="detail-tab-list">
          {DETAIL_TABS.filter((item) => item.id !== "encounters" || entity.kind === "player").map((item) => <button key={item.id} className={tab === item.id ? "selected" : ""} onClick={() => onTab(item.id)}>{item.label}</button>)}
        </div>
      </nav>
      {loading && <TableEmpty text="Loading entity detail…" />}
      {!loading && tab === "outgoingDamage" && <PowerTable key={`${entity.entityId}-outgoing-damage`} rows={entity.outgoingDamagePowers} amountLabel="Damage" hits={entity.individualOutHits} />}
      {!loading && tab === "outgoingHealing" && <PowerTable key={`${entity.entityId}-outgoing-healing`} rows={entity.outgoingHealingPowers} amountLabel="Healing" />}
      {!loading && tab === "incomingDamage" && <PowerTable key={`${entity.entityId}-incoming-damage`} rows={entity.incomingDamagePowers} amountLabel="Damage Taken" showSource hits={entity.individualInHits} incoming />}
      {!loading && tab === "incomingHealing" && <PowerTable key={`${entity.entityId}-incoming-healing`} rows={entity.incomingHealingPowers} amountLabel="Healing In" showSource />}
      {!loading && tab === "singleTargetDamage" && <TargetTable key={`${entity.entityId}-targets`} entity={entity} />}
      {!loading && tab === "individualOutHits" && <HitTable hits={entity.individualOutHits} title="Individual Out Hits" />}
      {!loading && tab === "individualInHits" && <HitTable hits={entity.individualInHits} title="Individual In Hits" />}
      {!loading && tab === "actionPointDetails" && <PowerTable key={`${entity.entityId}-resources`} rows={entity.actionPointDetails} amountLabel="Resource" resource />}
      {!loading && tab === "encounters" && <EntityEncounterHistory entity={entity} snapshot={snapshot} encounterIds={scope.encounterIds} splitPetDamage={splitPetDamage} />}
    </section>
  );
}

function PowerTable({ rows, amountLabel, showSource = false, resource = false, hits, incoming = false }: { rows: PowerBreakdown[]; amountLabel: string; showSource?: boolean; resource?: boolean; hits?: IndividualHit[]; incoming?: boolean }) {
  const [tableHeight, setTableHeight] = useState(70);
  const [selection, setSelection] = useState<{ keys: string[]; label: string } | null>(null);
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  const totalHits = rows.reduce((sum, row) => sum + row.hits, 0);
  const selectedRows = selection ? rows.filter((row) => selection.keys.includes(row.key)) : [];
  const selectedHits = hits ? filterHitsForPowers(hits, selectedRows, showSource) : [];

  useEffect(() => {
    setSelection(null);
  }, [amountLabel, incoming]);

  const selectPower = (keys: string[], label: string) => {
    if (!hits) return;
    setSelection({ keys, label });
  };

  return (
    <section className="power-analysis-view">
      <div className="power-table-panel" style={{ height: `${tableHeight}%` }}>
        <div className="table-scroll power-scroll">
          <table className={`data-grid power-grid ${showSource ? "with-source" : ""} ${resource ? "with-resource" : ""}`}>
            <thead><tr><th>Power</th>{showSource && <th>Source</th>}<th>{amountLabel}</th><th>%</th><th>DPS</th>{resource && <th>Net</th>}<th title="Average hit">Avg</th><th>Max</th><th>Hits</th><th title="Critical rate">Crit</th><th className="optional-col" title="Flank rate">Flank</th><th className="optional-col" title="Deflect rate">Deflect %</th></tr></thead>
            <tbody>
              <tr className="aggregate-row"><td>All</td>{showSource && <td>All</td>}<td>{formatNumber(total)}</td><td>100,0%</td><td>{formatNumber(rows.reduce((sum, row) => sum + row.combatDps, 0))}</td>{resource && <td>{formatSigned(rows.reduce((sum, row) => sum + row.netAmount, 0))}</td>}<td>{formatNumber(total / Math.max(1, totalHits))}</td><td>{formatNumber(Math.max(0, ...rows.map((row) => row.maxHit)))}</td><td>{totalHits.toLocaleString("tr-TR")}</td><td>{formatRate(powerWeightedRate(rows, "criticalRate"))}</td><td className="optional-col">{formatRate(powerWeightedRate(rows, "flankRate"))}</td><td className="optional-col">{formatRate(powerWeightedRate(rows, "deflectRate"))}</td></tr>
              {rows.map((row) => <tr className={`${hits ? "drillable-row" : ""} ${selection?.keys.length === 1 && selection.keys[0] === row.key ? "selected-data-row" : ""}`} key={row.key} title={`${row.type} · Median ${formatNumber(row.median)} · Min ${formatNumber(row.minHit)} · Hit ${formatRate(row.hitRate)} · Deflect ${formatRate(row.deflectRate)}${hits ? " · Click for timestamped hits" : ""}`} tabIndex={hits ? 0 : undefined} onClick={() => selectPower([row.key], row.sourceName ? `${row.sourceName} · ${row.name}` : row.name)} onKeyDown={(event) => { if (hits && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); selectPower([row.key], row.sourceName ? `${row.sourceName} · ${row.name}` : row.name); } }}><td className="name-cell"><strong>{row.name}</strong><small>{row.powerId}</small></td>{showSource && <td>{row.sourceName ?? "—"}</td>}<td>{formatNumber(row.amount)}</td><td>{formatRate(row.share)}</td><td>{formatNumber(row.combatDps)}</td>{resource && <td>{formatSigned(row.netAmount)}</td>}<td>{formatNumber(row.average)}</td><td>{formatNumber(row.maxHit)}</td><td>{row.hits.toLocaleString("tr-TR")}</td><td>{formatRate(row.criticalRate)}</td><td className="optional-col">{formatRate(row.flankRate)}</td><td className="optional-col">{formatRate(row.deflectRate)}</td></tr>)}
            </tbody>
          </table>
          {rows.length === 0 && <TableEmpty text="No events for this category." />}
        </div>
      </div>
      <VerticalSplitter label="Resize power table and graph" value={tableHeight} onResize={setTableHeight} minPercent={30} maxPercent={78} />
      <div className={`power-insight-pane ${hits ? "with-details" : ""}`}>
        <PowerDistributionGraph rows={rows} amountLabel={amountLabel} selectedKeys={selection?.keys ?? []} onSelect={hits ? selectPower : undefined} />
        {hits && <CompactHitTimeline hits={selectedHits} title={selection?.label} incoming={incoming} onClear={() => setSelection(null)} />}
      </div>
    </section>
  );
}

interface DonutSegment {
  id: string;
  label: string;
  amount: number;
  share: number;
  keys: string[];
}

const DONUT_COLORS = ["#1677b8", "#25a18e", "#6f56b5", "#d9852f", "#d14f58", "#4f82c3", "#79a643", "#a96091", "#7a8792"];

function PowerDistributionGraph({ rows, amountLabel, selectedKeys, onSelect }: { rows: PowerBreakdown[]; amountLabel: string; selectedKeys: string[]; onSelect?: (keys: string[], label: string) => void }) {
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  const leading = rows.slice(0, 5);
  const remainder = rows.slice(5);
  const segments: DonutSegment[] = leading.map((row) => ({ id: row.key, label: row.sourceName ? `${row.sourceName} · ${row.name}` : row.name, amount: row.amount, share: row.amount / Math.max(1, total), keys: [row.key] }));
  if (remainder.length > 0) {
    const amount = remainder.reduce((sum, row) => sum + row.amount, 0);
    segments.push({ id: "other", label: `Other (${remainder.length})`, amount, share: amount / Math.max(1, total), keys: remainder.map((row) => row.key) });
  }
  const radius = 62;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <section className="donut-panel">
      <div className="graph-title">{amountLabel} Distribution</div>
      {segments.length === 0 ? <div className="graph-empty">No data to graph.</div> : <div className="donut-content">
        <div className="donut-visual">
          <svg viewBox="0 0 180 180" role="img" aria-label={`${amountLabel} percentage distribution`}>
            <circle className="donut-track" cx="90" cy="90" r={radius} />
            {segments.map((segment, index) => {
              const length = segment.share * circumference;
              const dashOffset = -offset;
              offset += length;
              const selected = segment.keys.some((key) => selectedKeys.includes(key));
              return <circle key={segment.id} className={`donut-segment ${selected ? "selected" : ""} ${onSelect ? "interactive" : ""}`} cx="90" cy="90" r={radius} pathLength={circumference} stroke={DONUT_COLORS[index % DONUT_COLORS.length]} strokeDasharray={`${Math.max(0, length - 1.5)} ${Math.max(0, circumference - length + 1.5)}`} strokeDashoffset={dashOffset} transform="rotate(-90 90 90)" onClick={() => onSelect?.(segment.keys, segment.label)}><title>{`${segment.label} · ${formatNumber(segment.amount)} · ${formatRate(segment.share)}`}</title></circle>;
            })}
          </svg>
          <div className="donut-center"><strong>100%</strong><span>{formatCompactNumber(total)}</span></div>
        </div>
        <div className="donut-legend">
          {segments.map((segment, index) => <button type="button" key={segment.id} className={segment.keys.some((key) => selectedKeys.includes(key)) ? "selected" : ""} disabled={!onSelect} title={`${segment.label} · ${formatNumber(segment.amount)}`} onClick={() => onSelect?.(segment.keys, segment.label)}><i style={{ background: DONUT_COLORS[index % DONUT_COLORS.length] }} /><span>{segment.label}</span><strong>{formatRate(segment.share)}</strong></button>)}
        </div>
      </div>}
    </section>
  );
}

function CompactHitTimeline({ hits, title, incoming, onClear }: { hits: IndividualHit[]; title?: string; incoming: boolean; onClear: () => void }) {
  return <section className="hit-detail-pane">
    <div className="graph-title"><span>{title ? `${title} · ${hits.length} hits` : "Hit Details"}</span>{title && <button type="button" onClick={onClear}>Clear</button>}</div>
    {!title ? <div className="timeline-empty">Select a table row or chart slice to see when and how the damage occurred.</div> : <div className="table-scroll"><table className="data-grid compact-hit-grid"><thead><tr><th>Time</th><th>{incoming ? "Source" : "Target"}</th><th>Damage</th><th>Type</th><th>Flags</th></tr></thead><tbody>
      {hits.map((hit) => <tr key={hit.id} title={`Base: ${formatNumber(hit.baseAmount)} · Line ${hit.lineNumber}`}><td>{formatTimeWithMilliseconds(hit.timestamp)}</td><td>{incoming ? hit.sourceName : hit.targetName}</td><td>{formatNumber(hit.amount)}</td><td>{hit.type}</td><td>{hit.flags.join(" · ") || "—"}</td></tr>)}
    </tbody></table>{hits.length === 0 && <TableEmpty text="No retained hits matched this selection." />}</div>}
  </section>;
}

function EntityEncounterHistory({ entity, snapshot, encounterIds, splitPetDamage }: { entity: EntityAnalysis; snapshot: CombatSnapshot; encounterIds: string[]; splitPetDamage: boolean }) {
  const [selectedEncounterId, setSelectedEncounterId] = useState<string>();
  const [encounterDetail, setEncounterDetail] = useState<EntityAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [listHeight, setListHeight] = useState(42);
  const requestSequence = useRef(0);
  const included = new Set(encounterIds);
  const encounterRows = snapshot.encounters.filter((encounter) => included.has(encounter.id)).flatMap((encounter) => {
    const player = encounter.playerDamage.find((row) => row.playerId === entity.entityId || sameName(row.name, entity.name) || sameName(row.name, entity.baseName));
    return player ? [{ encounter, player }] : [];
  });

  useEffect(() => {
    requestSequence.current += 1;
    setSelectedEncounterId(undefined);
    setEncounterDetail(null);
    setError("");
  }, [entity.entityId, splitPetDamage]);

  const openEncounter = async (encounterId: string) => {
    const requestId = ++requestSequence.current;
    setSelectedEncounterId(encounterId);
    setEncounterDetail(null);
    setError("");
    setLoading(true);
    try {
      let detail = await window.analyzer.getEntityDetail(encounterId, splitPetDamage, entity.entityId);
      if (!detail) {
        const scopeEntities = await window.analyzer.getScopeEntities(encounterId, splitPetDamage);
        const match = scopeEntities.find((item) => item.stableId === entity.stableId || sameName(item.name, entity.name) || sameName(item.baseName, entity.baseName));
        if (match) detail = await window.analyzer.getEntityDetail(encounterId, splitPetDamage, match.entityId);
      }
      if (requestId !== requestSequence.current) return;
      setEncounterDetail(detail);
      if (!detail) setError("Player detail could not be resolved for this encounter.");
    } catch {
      if (requestId !== requestSequence.current) return;
      setError("Encounter hit details could not be loaded.");
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  };

  const selectedEncounter = snapshot.encounters.find((item) => item.id === selectedEncounterId);
  return <section className="encounter-history">
    <div className="encounter-history-list table-scroll" style={{ height: `${listHeight}%` }}>
      <table className="data-grid encounter-history-grid"><thead><tr><th>#</th><th>Start</th><th>Encounter</th><th>Duration</th><th>Damage</th><th>combatDPS</th><th>EncDPS</th></tr></thead><tbody>
        {encounterRows.map(({ encounter, player }) => <tr className={`drillable-row ${selectedEncounterId === encounter.id ? "selected-row" : ""}`} key={encounter.id} tabIndex={0} title="Click for timestamped damage events" onClick={() => void openEncounter(encounter.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); void openEncounter(encounter.id); } }}><td>{encounter.index}</td><td>{formatTime(encounter.startedAt)}</td><td className="name-cell">{encounter.primaryTarget}</td><td>{formatDuration(encounter.durationSeconds)}</td><td>{formatNumber(player.damage)}</td><td>{formatNumber(player.combatDps)}</td><td>{formatNumber(player.encDps)}</td></tr>)}
      </tbody></table>
      {encounterRows.length === 0 && <TableEmpty text="No encounter damage found for this entity." />}
    </div>
    <VerticalSplitter label="Resize encounters and hit timeline" value={listHeight} onResize={setListHeight} minPercent={24} maxPercent={70} />
    <div className="encounter-hit-panel">
      <div className="table-caption">{selectedEncounter ? `Encounter ${selectedEncounter.index} · ${selectedEncounter.primaryTarget} · timestamped hits` : "Select an encounter to see exactly when and how much damage was dealt."}</div>
      {loading ? <TableEmpty text="Loading encounter hits…" /> : error ? <TableEmpty text={error} /> : <EncounterHitTimeline hits={encounterDetail?.individualOutHits ?? []} encounterStart={selectedEncounter?.startedAt} />}
    </div>
  </section>;
}

function EncounterHitTimeline({ hits, encounterStart }: { hits: IndividualHit[]; encounterStart?: number }) {
  if (!encounterStart) return <div className="timeline-empty">No encounter selected.</div>;
  return <div className="table-scroll"><table className="data-grid hit-timeline-grid"><thead><tr><th>Time</th><th>Elapsed</th><th>Target</th><th>Power</th><th>Damage</th><th>Flags</th></tr></thead><tbody>
    {hits.map((hit) => <tr key={hit.id}><td>{formatTimeWithMilliseconds(hit.timestamp)}</td><td>+{formatElapsed(hit.timestamp - encounterStart)}</td><td>{hit.targetName}</td><td className="name-cell"><strong>{hit.powerName}</strong><small>{hit.powerId}</small></td><td>{formatNumber(hit.amount)}</td><td>{hit.flags.join(" · ") || "—"}</td></tr>)}
  </tbody></table>{hits.length === 0 && <TableEmpty text="No retained outgoing hits for this encounter." />}</div>;
}

function TargetTable({ entity }: { entity: EntityAnalysis }) {
  const [selectedTargetId, setSelectedTargetId] = useState<string>();
  const [tableHeight, setTableHeight] = useState(48);
  const selectedTarget = entity.singleTargetDamage.find((target) => target.entityId === selectedTargetId);
  const hits = selectedTargetId ? filterHitsForTarget(entity.individualOutHits, selectedTargetId) : [];
  useEffect(() => setSelectedTargetId(undefined), [entity.entityId]);
  return <section className="target-analysis-view">
    <div className="target-table-panel table-scroll" style={{ height: `${tableHeight}%` }}><table className="data-grid target-grid"><thead><tr><th>Target</th><th>Damage</th><th>%</th><th>Hits</th><th>Average</th><th>Max Hit</th></tr></thead><tbody>{entity.singleTargetDamage.map((target) => <tr className={`drillable-row ${selectedTargetId === target.entityId ? "selected-data-row" : ""}`} key={target.entityId} tabIndex={0} title="Click for timestamped hits" onClick={() => setSelectedTargetId(target.entityId)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedTargetId(target.entityId); } }}><td>{target.name}</td><td>{formatNumber(target.amount)}</td><td>{formatRate(target.share)}</td><td>{target.hits.toLocaleString("tr-TR")}</td><td>{formatNumber(target.average)}</td><td>{formatNumber(target.maxHit)}</td></tr>)}</tbody></table>{entity.singleTargetDamage.length === 0 && <TableEmpty text="No single-target damage in this scope." />}</div>
    <VerticalSplitter label="Resize targets and hit timeline" value={tableHeight} onResize={setTableHeight} minPercent={25} maxPercent={72} />
    <CompactHitTimeline hits={hits} title={selectedTarget?.name} incoming={false} onClear={() => setSelectedTargetId(undefined)} />
  </section>;
}

function HitTable({ hits, title }: { hits: IndividualHit[]; title: string }) {
  return <div className="table-scroll"><div className="table-caption">{title} · latest {hits.length} retained hits</div><table className="data-grid hit-grid"><thead><tr><th>Time</th><th>Source</th><th>Target</th><th>Power</th><th>Type</th><th>Damage</th><th>Flags</th></tr></thead><tbody>{hits.map((hit) => <tr key={hit.id} title={`Base: ${formatNumber(hit.baseAmount)}`}><td>{formatTimeWithMilliseconds(hit.timestamp)}</td><td>{hit.sourceName}</td><td>{hit.targetName}</td><td className="name-cell"><strong>{hit.powerName}</strong><small>{hit.powerId}</small></td><td>{hit.type}</td><td>{formatNumber(hit.amount)}</td><td>{hit.flags.join(" · ") || "—"}</td></tr>)}</tbody></table>{hits.length === 0 && <TableEmpty text="No individual hits in this category." />}</div>;
}

function EnemyPowerTable({ powers, search, stableOnly, rules, onSearch, onStableOnly, onCreateTimer }: { powers: EnemyPowerSummary[]; search: string; stableOnly: boolean; rules: TimerRule[]; onSearch: (value: string) => void; onStableOnly: (value: boolean) => void; onCreateTimer: (power: EnemyPowerSummary) => void }) {
  return <TableSection title="Enemy Power Frequency" subtitle="Repeated casts are detected per enemy instance; irregular powers are excluded from automatic suggestions">
    <div className="filter-strip"><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Enemy or power name" /><label><input type="checkbox" checked={stableOnly} onChange={(event) => onStableOnly(event.target.checked)} /> stable intervals only</label></div>
    <table className="data-grid"><thead><tr><th>Enemy</th><th>Power</th><th>Casts</th><th>Estimated Interval</th><th>Observed Range</th><th>MAD</th><th>Confidence</th><th /></tr></thead><tbody>{powers.map((power) => { const added = rules.some((rule) => rule.enemyId === power.enemyId && rule.abilityId === power.abilityId); return <tr key={power.key}><td className="name-cell"><strong>{power.enemyName}</strong><small>{shortArchetype(power.enemyId)}</small></td><td className="name-cell"><strong>{power.abilityName}</strong><small>{power.abilityId}</small></td><td>{power.castCount}</td><td>{power.cadence.estimatedIntervalSeconds ? `${formatDecimal(power.cadence.estimatedIntervalSeconds)} sec` : "—"}</td><td>{power.cadence.observedRangeSeconds ? `${formatDecimal(power.cadence.observedRangeSeconds[0])}–${formatDecimal(power.cadence.observedRangeSeconds[1])}` : "—"}</td><td>{power.cadence.medianAbsoluteDeviationSeconds !== null ? `±${formatDecimal(power.cadence.medianAbsoluteDeviationSeconds)}` : "—"}</td><td>{power.cadence.confidence}% · {power.cadence.classification}</td><td><button className="table-button" disabled={added || !power.cadence.estimatedIntervalSeconds} onClick={() => onCreateTimer(power)}>{added ? "Added" : "Add Timer"}</button></td></tr>; })}</tbody></table>{powers.length === 0 && <TableEmpty text="No powers match the current filter." />}
  </TableSection>;
}

function TimersPage({ powers, rules, onSave, onDelete }: { powers: EnemyPowerSummary[]; rules: TimerRule[]; onSave: (rule: TimerRule) => void; onDelete: (id: string) => void }) {
  const candidates = powers.filter((power) => power.cadence.estimatedIntervalSeconds !== null);
  const [powerKey, setPowerKey] = useState(candidates[0]?.key ?? "");
  const selected = candidates.find((power) => power.key === powerKey) ?? candidates[0];
  const [interval, setIntervalValue] = useState("24");
  const [warning, setWarning] = useState("5");
  const [content, setContent] = useState("Gzemnid's Reliquary");
  useEffect(() => {
    if (selected?.cadence.estimatedIntervalSeconds) setIntervalValue(selected.cadence.estimatedIntervalSeconds.toFixed(1));
  }, [selected?.key]);
  const addManual = () => {
    if (!selected) return;
    onSave({ id: crypto.randomUUID(), contentName: content.trim() || "Custom Content", difficulty: "Master", enemyId: selected.enemyId, enemyName: selected.enemyName, abilityId: selected.abilityId, abilityName: selected.abilityName, intervalSeconds: Math.max(1, Number(interval) || 1), warningSeconds: Math.max(0, Number(warning) || 0), episodeGapSeconds: 5, enabled: true, origin: "manual", createdAt: Date.now() });
  };
  return <div className="timers-layout"><TableSection title="Timers" subtitle="Enabled rules start the non-interactive overlay when the matching cast appears in the live log"><table className="data-grid"><thead><tr><th>On</th><th>Content</th><th>Enemy</th><th>Power</th><th>Interval</th><th>Warning</th><th>Origin</th><th /></tr></thead><tbody>{rules.map((rule) => <tr key={rule.id}><td><input type="checkbox" checked={rule.enabled} onChange={() => onSave({ ...rule, enabled: !rule.enabled })} /></td><td>{rule.contentName}</td><td>{rule.enemyName}</td><td>{rule.abilityName}</td><td>{formatDecimal(rule.intervalSeconds)} sec</td><td>{formatDecimal(rule.warningSeconds)} sec</td><td>{rule.origin}</td><td><button className="table-button danger" onClick={() => onDelete(rule.id)}>Delete</button></td></tr>)}</tbody></table>{rules.length === 0 && <TableEmpty text="No timer rules have been created." />}</TableSection>
    <section className="timer-editor"><div className="section-heading"><strong>New Timer</strong><small>Choose a discovered enemy power and edit its interval.</small></div><label>Content<input value={content} onChange={(event) => setContent(event.target.value)} /></label><label>Enemy power<select value={selected?.key ?? ""} onChange={(event) => setPowerKey(event.target.value)}>{candidates.map((power) => <option key={power.key} value={power.key}>{power.enemyName} · {power.abilityName}</option>)}</select></label><div className="field-pair"><label>Interval (sec)<input type="number" min="1" step="0.1" value={interval} onChange={(event) => setIntervalValue(event.target.value)} /></label><label>Warn before<input type="number" min="0" step="0.5" value={warning} onChange={(event) => setWarning(event.target.value)} /></label></div><button className="dialog-button" disabled={!selected} onClick={addManual}>Add Timer</button>{selected?.cadence.estimatedIntervalSeconds && <p>Detected: {formatDecimal(selected.cadence.estimatedIntervalSeconds)} sec · confidence {selected.cadence.confidence}%</p>}</section>
  </div>;
}

function VerticalSplitter({ label, value, onResize, minPercent, maxPercent }: { label: string; value: number; onResize: (percent: number) => void; minPercent: number; maxPercent: number }) {
  return <div
    className="vertical-splitter"
    role="separator"
    aria-label={label}
    aria-orientation="horizontal"
    aria-valuemin={minPercent}
    aria-valuemax={maxPercent}
    aria-valuenow={Math.round(value)}
    tabIndex={0}
    onPointerDown={(event) => beginVerticalResize(event, onResize, minPercent, maxPercent)}
    onKeyDown={(event) => {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      event.preventDefault();
      const delta = event.key === "ArrowUp" ? -3 : 3;
      onResize(Math.min(maxPercent, Math.max(minPercent, value + delta)));
    }}
  ><span /></div>;
}

function beginVerticalResize(event: ReactPointerEvent<HTMLDivElement>, onResize: (percent: number) => void, minPercent: number, maxPercent: number): void {
  const container = event.currentTarget.parentElement;
  if (!container) return;
  event.preventDefault();
  const bounds = container.getBoundingClientRect();
  const previousCursor = document.body.style.cursor;
  const previousSelection = document.body.style.userSelect;
  document.body.style.cursor = "row-resize";
  document.body.style.userSelect = "none";
  const move = (moveEvent: PointerEvent) => {
    const percent = (moveEvent.clientY - bounds.top) / Math.max(1, bounds.height) * 100;
    onResize(Math.min(maxPercent, Math.max(minPercent, percent)));
  };
  const stop = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", stop);
    window.removeEventListener("pointercancel", stop);
    document.body.style.cursor = previousCursor;
    document.body.style.userSelect = previousSelection;
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", stop);
  window.addEventListener("pointercancel", stop);
}

function TableSection({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <section className="table-section"><div className="section-heading"><strong>{title}</strong><small>{subtitle}</small></div><div className="table-scroll">{children}</div></section>;
}

function TableEmpty({ text }: { text: string }) {
  return <div className="table-empty">{text}</div>;
}

function NoData({ status, onLoad }: { status: MonitorStatus; onLoad: () => void }) {
  return <main className="no-data"><div className="no-data-box"><strong>{status.state === "loading" ? "Combatlog is being analyzed" : "No combat data loaded"}</strong><span>{status.message}</span><button onClick={onLoad} disabled={status.state === "loading"}>Load Combatlog</button><small>The file stays connected and updates this window as the game appends new lines.</small></div></main>;
}

interface EntityTableProps {
  entities: EntityAnalysis[];
  onSelect: (entity: EntityAnalysis) => void;
}

function buildScope(
  snapshot: CombatSnapshot,
  selection: ScopeSelection,
  encounterIds: string[],
  scopeId: string,
  splitPets: boolean,
  remoteEntities: EntityAnalysis[],
): ScopeView {
  const included = new Set(encounterIds);
  const encounters = snapshot.encounters.filter((item) => included.has(item.id));
  const directEncounter =
    selection.kind === "encounter" ? encounters[0] : undefined;
  const run =
    selection.kind === "run"
      ? snapshot.runs.find((item) => item.id === selection.runId)
      : undefined;
  const label = directEncounter
    ? `Encounter ${directEncounter.index} · ${directEncounter.primaryTarget}`
    : run
      ? `Run ${run.index}${run.contentKey ? ` · ${run.contentKey}` : ""}`
      : selection.kind === "selection"
        ? `Merged selection · ${encounters.length} encounters`
        : "All Encounters";
  const fallbackEntities =
    selection.kind === "all" && encounterIds.length === snapshot.encounters.length
      ? splitPets
        ? snapshot.splitEntities
        : snapshot.entities
      : [];
  const entities = remoteEntities.length > 0 ? remoteEntities : fallbackEntities;
  const durationMode = selection.kind === "selection" ? "sum" : "elapsed";
  return {
    id: scopeId,
    label,
    startedAt: encounters[0]?.startedAt ?? null,
    endedAt: encounters.at(-1)?.endedAt ?? null,
    durationSeconds: Math.max(1, scopeDuration(snapshot, encounterIds, durationMode)),
    totalDamage: encounters.reduce((sum, item) => sum + item.totalDamage, 0),
    totalHealing: encounters.reduce((sum, item) => sum + item.totalHealing, 0),
    entities,
    deaths: encounters.flatMap((item) => item.deaths),
    encounterIds,
  };
}

function scopeDuration(
  snapshot: CombatSnapshot,
  encounterIds: string[],
  mode: "elapsed" | "sum",
): number {
  const included = new Set(encounterIds);
  const encounters = snapshot.encounters.filter((item) => included.has(item.id));
  if (mode === "sum") {
    return encounters.reduce((sum, item) => sum + item.durationSeconds, 0);
  }
  return snapshot.runs.reduce((sum, run) => {
    const values = encounters.filter((item) => item.runId === run.id);
    const first = values[0];
    const last = values.at(-1);
    return first && last
      ? sum + Math.max(0, (last.endedAt - first.startedAt) / 1_000)
      : sum;
  }, 0);
}

function readHiddenEncounterIds(filePath: string): string[] {
  try {
    const value = JSON.parse(
      window.localStorage.getItem(hiddenEncounterStorageKey(filePath)) ?? "[]",
    ) as unknown;
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function writeHiddenEncounterIds(filePath: string, ids: Set<string>): void {
  window.localStorage.setItem(
    hiddenEncounterStorageKey(filePath),
    JSON.stringify([...ids]),
  );
}

function hiddenEncounterStorageKey(filePath: string): string {
  return `${HIDDEN_ENCOUNTER_STORAGE_PREFIX}${encodeURIComponent(filePath)}`;
}

function partyEntities(entities: EntityAnalysis[]): EntityAnalysis[] {
  return entities.filter((entity) => (entity.kind === "player" || entity.kind === "pet") && entity.outgoingDamage > 0).sort((left, right) => right.outgoingDamage - left.outgoingDamage);
}

function weightedRate(entities: EntityAnalysis[], rate: "criticalRate" | "flankRate", weight: "hits"): number {
  const total = entities.reduce((sum, entity) => sum + entity[weight], 0);
  return total > 0 ? entities.reduce((sum, entity) => sum + entity[rate] * entity[weight], 0) / total : 0;
}

function powerWeightedRate(rows: PowerBreakdown[], rate: "criticalRate" | "flankRate" | "flankDamageRate" | "deflectRate" | "effectiveness", weight: "hits" | "amount" = "hits"): number {
  const total = rows.reduce((sum, row) => sum + row[weight], 0);
  return total > 0 ? rows.reduce((sum, row) => sum + row[rate] * row[weight], 0) / total : 0;
}

function entityTypeLabel(entity: EntityAnalysis): string {
  if (entity.kind === "pet") return entity.ownerName ? `Pet of ${entity.ownerName}` : "Pet";
  if (entity.kind === "enemy") return "NPC / Enemy";
  if (entity.kind === "player") return "Player";
  return "Entity";
}

function statusLabel(status: MonitorStatus): string {
  if (status.state === "live") return "LIVE";
  if (status.state === "loading") return "LOADING";
  if (status.state === "error") return "ERROR";
  return "IDLE";
}

function formatNumber(value: number): string {
  return Math.round(Number.isFinite(value) ? value : 0).toLocaleString("tr-TR");
}

function sameName(left: string, right: string): boolean {
  return left.trim().toLocaleLowerCase("tr-TR") === right.trim().toLocaleLowerCase("tr-TR");
}

function formatCompactNumber(value: number): string {
  const safe = Math.max(0, Number.isFinite(value) ? value : 0);
  if (safe >= 1_000_000_000) {
    return `${(safe / 1_000_000_000).toLocaleString("tr-TR", { maximumFractionDigits: 2 })}B`;
  }
  if (safe >= 1_000_000) {
    return `${(safe / 1_000_000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}M`;
  }
  if (safe >= 1_000) {
    return `${(safe / 1_000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}K`;
  }
  return Math.round(safe).toLocaleString("tr-TR");
}

function formatFileName(filePath: string): string {
  const normalized = filePath.replaceAll("\\", "/");
  return normalized.split("/").at(-1) ?? filePath;
}

function formatDecimal(value: number): string {
  return (Number.isFinite(value) ? value : 0).toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function formatSigned(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return `${safe > 0 ? "+" : ""}${safe.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`;
}

function formatRate(value: number): string {
  return (Math.max(0, Number.isFinite(value) ? value : 0) * 100).toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
}

function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.round(Number.isFinite(seconds) ? seconds : 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remaining = safe % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${remaining.toString().padStart(2, "0")}`;
}

function formatTime(timestamp: number | null): string {
  if (!timestamp) return "--:--:--";
  return new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(timestamp);
}

function formatTimeWithMilliseconds(timestamp: number): string {
  return new Intl.DateTimeFormat("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
    hour12: false,
  }).format(timestamp);
}

function formatElapsed(milliseconds: number): string {
  const safe = Math.max(0, milliseconds);
  const minutes = Math.floor(safe / 60_000);
  const seconds = (safe % 60_000) / 1_000;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toLocaleString("tr-TR", { minimumFractionDigits: 3, maximumFractionDigits: 3 }).padStart(6, "0")}`;
}

function inferContent(enemyId: string): string {
  return enemyId.toLowerCase().includes("gzemnid") ? "Gzemnid's Reliquary" : "Custom Content";
}

function shortArchetype(enemyId: string): string {
  return enemyId.replace(/^creature:/, "").replaceAll("_", " ");
}

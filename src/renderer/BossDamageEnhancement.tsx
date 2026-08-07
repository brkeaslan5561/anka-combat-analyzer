import { useEffect } from "react";
import type { CombatSnapshot, EntityAnalysis } from "../shared/types";

interface BossDamageRow {
  playerId: string;
  name: string;
  damage: number;
  share: number;
}

interface BossDamageView {
  encounterId: string;
  generatedAt: number;
  bossName: string;
  totalDamage: number;
  rows: BossDamageRow[];
}

export function BossDamageEnhancement() {
  useEffect(() => {
    let snapshot: CombatSnapshot | null = null;
    let cached: BossDamageView | null = null;
    let loadingKey = "";
    let scheduled = false;
    let disposed = false;

    const selectedEncounter = () => {
      if (!snapshot) return null;
      const tree = document.querySelector<HTMLElement>(".encounter-tree");
      if (!tree) return null;

      const selected = tree.querySelector<HTMLElement>(
        ":scope > .tree-branch > .tree-row.selected",
      );
      if (!selected) return null;

      const branch = selected.parentElement as HTMLElement | null;
      const encounterId = branch?.dataset.encounterId;
      if (encounterId) {
        return snapshot.encounters.find((item) => item.id === encounterId) ?? null;
      }

      const branches = Array.from(
        tree.querySelectorAll<HTMLElement>(":scope > .tree-branch"),
      );
      const index = branch ? branches.indexOf(branch) : -1;
      return index >= 0 ? snapshot.encounters[index] ?? null : null;
    };

    const schedule = () => {
      if (scheduled || disposed) return;
      scheduled = true;
      window.requestAnimationFrame(() => {
        scheduled = false;
        void refresh();
      });
    };

    const refresh = async () => {
      if (!snapshot) {
        clearBossColumns();
        return;
      }

      const encounter = selectedEncounter();
      if (!encounter || !isBossEncounter(encounter.primaryTarget)) {
        cached = null;
        loadingKey = "";
        clearBossColumns();
        return;
      }

      const key = `${encounter.id}:${snapshot.generatedAt}`;
      if (
        cached?.encounterId === encounter.id &&
        cached.generatedAt === snapshot.generatedAt
      ) {
        decorateBossColumns(cached);
        return;
      }
      if (loadingKey === key) return;
      loadingKey = key;

      try {
        const summaries = await window.analyzer.getScopeEntities(
          encounter.id,
          false,
        );
        if (disposed || loadingKey !== key) return;

        const players = summaries.filter(
          (entity) => entity.kind === "player" && entity.outgoingDamage > 0,
        );
        const details = await Promise.all(
          players.map((entity) =>
            window.analyzer.getEntityDetail(encounter.id, false, entity.entityId),
          ),
        );
        if (disposed || loadingKey !== key) return;

        const bossName = extractBossName(encounter.primaryTarget);
        const rawRows = details
          .filter((detail): detail is EntityAnalysis => Boolean(detail))
          .map((detail) => ({
            playerId: detail.entityId,
            name: detail.name,
            damage: detail.singleTargetDamage
              .filter((target) => sameTargetName(target.name, bossName))
              .reduce((sum, target) => sum + target.amount, 0),
          }))
          .filter((row) => row.damage > 0);
        const totalDamage = rawRows.reduce((sum, row) => sum + row.damage, 0);

        cached = {
          encounterId: encounter.id,
          generatedAt: snapshot.generatedAt,
          bossName,
          totalDamage,
          rows: rawRows
            .map((row) => ({
              ...row,
              share: totalDamage > 0 ? row.damage / totalDamage : 0,
            }))
            .sort((left, right) => right.damage - left.damage),
        };
        decorateBossColumns(cached);
      } finally {
        if (loadingKey === key) loadingKey = "";
      }
    };

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "data-encounter-id"],
    });

    void window.analyzer.getInitialState().then((state) => {
      if (disposed) return;
      snapshot = state.snapshot;
      schedule();
    });
    const unsubscribe = window.analyzer.onSnapshot((nextSnapshot) => {
      snapshot = nextSnapshot;
      cached = null;
      schedule();
    });

    schedule();
    return () => {
      disposed = true;
      unsubscribe();
      observer.disconnect();
      clearBossColumns();
    };
  }, []);

  return null;
}

function decorateBossColumns(view: BossDamageView): void {
  const table = document.querySelector<HTMLTableElement>(
    ".analysis-pane table.ranking-grid",
  );
  if (!table) return;

  const headerRow = table.tHead?.rows[0];
  const body = table.tBodies[0];
  if (!headerRow || !body) return;

  removeBossCells(table);

  const damageHeader = document.createElement("th");
  damageHeader.className = "boss-damage-column";
  damageHeader.dataset.bossMetric = "damage";
  damageHeader.textContent = "Boss Damage";
  damageHeader.title = `${view.bossName} only; add damage is excluded`;

  const shareHeader = document.createElement("th");
  shareHeader.className = "boss-share-column";
  shareHeader.dataset.bossMetric = "share";
  shareHeader.textContent = "Boss %";
  shareHeader.title = `Share of all player damage dealt directly to ${view.bossName}`;

  insertAfterColumn(headerRow, 2, damageHeader);
  insertAfterColumn(headerRow, 3, shareHeader);

  const byName = new Map(
    view.rows.map((row) => [normalizeName(row.name), row] as const),
  );

  for (const row of Array.from(body.rows)) {
    const damageCell = document.createElement("td");
    damageCell.className = "boss-damage-column";
    damageCell.dataset.bossMetric = "damage";
    const shareCell = document.createElement("td");
    shareCell.className = "boss-share-column";
    shareCell.dataset.bossMetric = "share";

    if (row.classList.contains("aggregate-row")) {
      damageCell.textContent = formatNumber(view.totalDamage);
      shareCell.textContent = view.totalDamage > 0 ? "100,0%" : "—";
      damageCell.title = `${view.bossName} total player damage`;
      shareCell.title = `${view.bossName} total player share`;
    } else {
      const name = row.querySelector<HTMLElement>(".name-cell strong")?.textContent ?? "";
      const player = byName.get(normalizeName(name));
      damageCell.textContent = player ? formatNumber(player.damage) : "—";
      shareCell.textContent = player ? formatRate(player.share) : "—";
      if (player) {
        const title = `${player.name}: ${formatNumber(player.damage)} damage to ${view.bossName} (${formatRate(player.share)})`;
        damageCell.title = title;
        shareCell.title = title;
      }
    }

    insertAfterColumn(row, 2, damageCell);
    insertAfterColumn(row, 3, shareCell);
  }

  table.dataset.bossDamageEncounter = view.encounterId;
}

function clearBossColumns(): void {
  const table = document.querySelector<HTMLTableElement>(
    ".analysis-pane table.ranking-grid",
  );
  if (!table) return;
  removeBossCells(table);
  delete table.dataset.bossDamageEncounter;
}

function removeBossCells(table: HTMLTableElement): void {
  table
    .querySelectorAll<HTMLElement>("[data-boss-metric]")
    .forEach((element) => element.remove());
}

function insertAfterColumn(
  row: HTMLTableRowElement,
  columnIndex: number,
  cell: HTMLTableCellElement,
): void {
  const reference = row.cells[columnIndex + 1] ?? null;
  row.insertBefore(cell, reference);
}

function isBossEncounter(label: string): boolean {
  return label.split(" · ").some((part) => part.trim() === "BOSS");
}

function extractBossName(label: string): string {
  const parts = label.split(" · ").map((part) => part.trim()).filter(Boolean);
  const bossIndex = parts.indexOf("BOSS");
  return bossIndex >= 0 ? parts.slice(bossIndex + 1).join(" · ") : parts.at(-1) ?? label;
}

function sameTargetName(left: string, right: string): boolean {
  return normalizeTargetName(left) === normalizeTargetName(right);
}

function normalizeTargetName(value: string): string {
  return value
    .replace(/\s+\[\d+\]\s*$/, "")
    .trim()
    .toLocaleLowerCase("en-US");
}

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase("tr-TR");
}

function formatNumber(value: number): string {
  return Math.round(Number.isFinite(value) ? value : 0).toLocaleString("tr-TR");
}

function formatRate(value: number): string {
  return `${(Math.max(0, Number.isFinite(value) ? value : 0) * 100).toLocaleString(
    "tr-TR",
    { minimumFractionDigits: 1, maximumFractionDigits: 1 },
  )}%`;
}

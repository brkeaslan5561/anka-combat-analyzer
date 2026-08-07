import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { UpdateStatus } from "../shared/types";

export function DesktopEnhancements() {
  useSortableTables();
  const titlebar = usePortalTarget(".app-titlebar");
  const encounterPane = usePortalTarget(".encounter-browser");

  return (
    <>
      {titlebar && createPortal(<TitlebarExtras />, titlebar)}
      {encounterPane && createPortal(<EncounterControls />, encounterPane)}
    </>
  );
}

function TitlebarExtras() {
  const [update, setUpdate] = useState<UpdateStatus | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    let active = true;
    void window.analyzer.getUpdateStatus().then((status) => {
      if (active) setUpdate(status);
    });
    void window.analyzer.isWindowMaximized().then((value) => {
      if (active) setMaximized(value);
    });
    const unsubscribe = window.analyzer.onWindowMaximizedChanged((value) => {
      if (active) setMaximized(value);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const handleUpdateClick = async () => {
    if (!update || downloading) return;
    if (update.state === "current") {
      const refreshed = await window.analyzer.getUpdateStatus();
      setUpdate(refreshed);
      return;
    }
    if (update.state === "error") {
      const refreshed = await window.analyzer.getUpdateStatus();
      setUpdate(refreshed);
      return;
    }

    setDownloading(true);
    try {
      const result = await window.analyzer.downloadUpdate();
      window.alert(result.message);
    } finally {
      setDownloading(false);
    }
  };

  const updateClass =
    update?.state === "current"
      ? "current"
      : update?.state === "available"
        ? "available"
        : "error";
  const updateLabel = downloading
    ? "Downloading…"
    : update?.state === "current"
      ? "Up to date"
      : update?.state === "available"
        ? "Not up to date"
        : update
          ? "Update check failed"
          : "Checking update…";
  const updateTitle = update
    ? update.state === "available"
      ? `Installed v${update.currentVersion} · Latest v${update.latestVersion ?? "?"}. Click to download.`
      : update.state === "current"
        ? `Installed v${update.currentVersion}. Click to check again.`
        : `${update.message}. Click to retry.`
    : "Checking GitHub releases…";

  return (
    <div className="titlebar-extras">
      <button
        className={`update-status-button ${updateClass}`}
        onClick={handleUpdateClick}
        disabled={downloading || !update}
        title={updateTitle}
      >
        <span className="update-status-dot" />
        <span>{updateLabel}</span>
        {update?.currentVersion && (
          <small>v{update.currentVersion}</small>
        )}
      </button>
      <div className="window-controls" aria-label="Window controls">
        <button
          className="window-control"
          title="Minimize"
          aria-label="Minimize"
          onClick={() => void window.analyzer.minimizeWindow()}
        >
          <span className="window-minimize-glyph" />
        </button>
        <button
          className="window-control"
          title={maximized ? "Restore" : "Maximize"}
          aria-label={maximized ? "Restore" : "Maximize"}
          onClick={() => {
            void window.analyzer.toggleMaximizeWindow().then(setMaximized);
          }}
        >
          <span className={maximized ? "window-restore-glyph" : "window-maximize-glyph"} />
        </button>
        <button
          className="window-control close"
          title="Close"
          aria-label="Close"
          onClick={() => void window.analyzer.closeWindow()}
        >
          <span className="window-close-glyph" />
        </button>
      </div>
    </div>
  );
}

function EncounterControls() {
  const run = async (action: "start" | "end" | "fail") => {
    if (action === "start") await window.analyzer.startNewEncounter();
    if (action === "end") await window.analyzer.endEncounter();
    if (action === "fail") await window.analyzer.markEncounterFail();
  };

  return (
    <div className="encounter-controls">
      <button
        title="End the current encounter and make the next combat a manual encounter"
        onClick={() => void run("start")}
      >
        + New
      </button>
      <button
        title="End the current encounter now"
        onClick={() => void run("end")}
      >
        End
      </button>
      <button
        className="fail"
        title="Mark the current encounter as failed and end it"
        onClick={() => void run("fail")}
      >
        Fail
      </button>
    </div>
  );
}

function usePortalTarget(selector: string): Element | null {
  const [target, setTarget] = useState<Element | null>(null);

  useEffect(() => {
    const resolve = () => setTarget(document.querySelector(selector));
    resolve();
    const observer = new MutationObserver(resolve);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [selector]);

  return target;
}

function useSortableTables() {
  useEffect(() => {
    let scheduled = false;
    const decorate = () => {
      for (const table of document.querySelectorAll<HTMLTableElement>(
        "table.data-grid",
      )) {
        table.querySelectorAll<HTMLTableCellElement>("thead th").forEach((th) => {
          if (th.colSpan > 1 || th.textContent?.trim() === "") return;
          th.classList.add("sortable-header");
          th.title = th.title || "Click to sort";
        });
      }
    };

    const applyAllSorts = () => {
      for (const table of document.querySelectorAll<HTMLTableElement>(
        "table.data-grid[data-sort-column]",
      )) {
        applyTableSort(table);
      }
    };

    const refresh = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        observer.disconnect();
        decorate();
        applyAllSorts();
        observer.observe(document.body, { childList: true, subtree: true });
      });
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const th = target?.closest<HTMLTableCellElement>("table.data-grid thead th");
      if (!th || !th.classList.contains("sortable-header")) return;
      const table = th.closest<HTMLTableElement>("table.data-grid");
      if (!table) return;
      const headers = Array.from(th.parentElement?.children ?? []);
      const column = headers.indexOf(th);
      if (column < 0) return;
      const isName = th.textContent?.trim().toLocaleLowerCase("en-US") === "name";
      const currentColumn = Number(table.dataset.sortColumn ?? "-1");
      const currentDirection = table.dataset.sortDirection;
      const nextDirection =
        currentColumn === column
          ? currentDirection === "desc"
            ? "asc"
            : "desc"
          : isName
            ? "asc"
            : "desc";
      table.dataset.sortColumn = String(column);
      table.dataset.sortDirection = nextDirection;
      table.querySelectorAll<HTMLTableCellElement>("thead th").forEach((header) => {
        delete header.dataset.sortDirection;
      });
      th.dataset.sortDirection = nextDirection;
      applyTableSort(table);
    };

    const observer = new MutationObserver(refresh);
    decorate();
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("click", onClick);
    return () => {
      observer.disconnect();
      document.removeEventListener("click", onClick);
    };
  }, []);
}

function applyTableSort(table: HTMLTableElement) {
  const column = Number(table.dataset.sortColumn ?? "-1");
  if (column < 0) return;
  const direction = table.dataset.sortDirection === "asc" ? 1 : -1;
  const tbody = table.tBodies[0];
  if (!tbody) return;
  const rows = Array.from(tbody.rows);
  const pinned = rows.filter((row) => row.classList.contains("aggregate-row"));
  const sortable = rows.filter((row) => !row.classList.contains("aggregate-row"));
  const header = table.tHead?.rows[0]?.cells[column]?.textContent
    ?.trim()
    .toLocaleLowerCase("en-US");
  const nameSort = header === "name";

  sortable.sort((left, right) => {
    const leftText = left.cells[column]?.textContent?.trim() ?? "";
    const rightText = right.cells[column]?.textContent?.trim() ?? "";
    if (nameSort) {
      return leftText.localeCompare(rightText, undefined, {
        numeric: true,
        sensitivity: "base",
      }) * direction;
    }
    const leftNumber = parseSortableNumber(leftText);
    const rightNumber = parseSortableNumber(rightText);
    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
      return (leftNumber - rightNumber) * direction;
    }
    return leftText.localeCompare(rightText, undefined, {
      numeric: true,
      sensitivity: "base",
    }) * direction;
  });

  for (const row of [...pinned, ...sortable]) tbody.appendChild(row);
}

function parseSortableNumber(value: string): number {
  const text = value.trim().toLocaleLowerCase("en-US");
  if (!text || text === "—" || text === "-") return Number.NaN;

  const duration = parseDuration(text);
  if (duration !== null) return duration;

  const compact = text.match(/^(-?[\d.,]+)\s*([kmb])$/i);
  if (compact) {
    const number = parseLocaleNumber(compact[1]);
    const multiplier =
      compact[2].toLowerCase() === "b"
        ? 1_000_000_000
        : compact[2].toLowerCase() === "m"
          ? 1_000_000
          : 1_000;
    return number * multiplier;
  }

  return parseLocaleNumber(text.replace(/[^\d,.-]/g, ""));
}

function parseDuration(text: string): number | null {
  if (!/[hms]/.test(text)) return null;
  let seconds = 0;
  let matched = false;
  const hours = text.match(/([\d.,]+)\s*h/);
  const minutes = text.match(/([\d.,]+)\s*m/);
  const secs = text.match(/([\d.,]+)\s*s/);
  if (hours) {
    seconds += parseLocaleNumber(hours[1]) * 3_600;
    matched = true;
  }
  if (minutes) {
    seconds += parseLocaleNumber(minutes[1]) * 60;
    matched = true;
  }
  if (secs) {
    seconds += parseLocaleNumber(secs[1]);
    matched = true;
  }
  return matched ? seconds : null;
}

function parseLocaleNumber(value: string): number {
  const text = value.trim();
  if (!text) return Number.NaN;
  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  if (lastComma > lastDot) {
    return Number(text.replaceAll(".", "").replace(",", "."));
  }
  if (lastDot > lastComma && lastComma >= 0) {
    return Number(text.replaceAll(",", ""));
  }
  if (lastDot >= 0) {
    const groups = text.split(".");
    if (groups.length > 1 && groups.slice(1).every((group) => group.length === 3)) {
      return Number(groups.join(""));
    }
  }
  return Number(text.replace(",", "."));
}

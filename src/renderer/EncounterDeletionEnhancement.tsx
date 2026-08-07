import { useEffect } from "react";
import type { CombatSnapshot } from "../shared/types";

const STORAGE_PREFIX = "anka:hidden-encounters:";

export function EncounterDeletionEnhancement() {
  useEffect(() => {
    let snapshot: CombatSnapshot | null = null;
    let scheduled = false;

    const storageKey = () =>
      snapshot ? `${STORAGE_PREFIX}${encodeURIComponent(snapshot.filePath)}` : null;

    const readHidden = (): Set<string> => {
      const key = storageKey();
      if (!key) return new Set();
      try {
        const parsed = JSON.parse(window.localStorage.getItem(key) ?? "[]") as unknown;
        return new Set(
          Array.isArray(parsed)
            ? parsed.filter((value): value is string => typeof value === "string")
            : [],
        );
      } catch {
        return new Set();
      }
    };

    const writeHidden = (hidden: Set<string>) => {
      const key = storageKey();
      if (!key) return;
      window.localStorage.setItem(key, JSON.stringify([...hidden]));
    };

    const decorate = () => {
      scheduled = false;
      if (!snapshot) return;

      const tree = document.querySelector<HTMLElement>(".encounter-tree");
      if (!tree) return;

      const branches = Array.from(
        tree.querySelectorAll<HTMLElement>(":scope > .tree-branch"),
      );
      const hidden = readHidden();

      branches.forEach((branch, index) => {
        const encounter = snapshot?.encounters[index];
        if (!encounter) return;

        branch.classList.add("encounter-deletable");
        branch.dataset.encounterId = encounter.id;
        branch.classList.toggle("encounter-hidden", hidden.has(encounter.id));

        let deleteButton = branch.querySelector<HTMLButtonElement>(
          ":scope > .encounter-delete-button",
        );
        if (!deleteButton) {
          deleteButton = document.createElement("button");
          deleteButton.type = "button";
          deleteButton.className = "encounter-delete-button";
          deleteButton.textContent = "×";
          deleteButton.setAttribute("aria-label", "Delete encounter");
          branch.appendChild(deleteButton);
        }

        deleteButton.title = `Delete ${encounter.index}. ${encounter.primaryTarget}`;
        deleteButton.onclick = (event) => {
          event.preventDefault();
          event.stopPropagation();

          const label = `${encounter.index}. ${encounter.primaryTarget}`;
          if (!window.confirm(`Delete this encounter from the list?\n\n${label}`)) {
            return;
          }

          const nextHidden = readHidden();
          nextHidden.add(encounter.id);
          writeHidden(nextHidden);

          const row = branch.querySelector<HTMLElement>(":scope > .tree-row");
          if (row?.classList.contains("selected")) {
            tree.querySelector<HTMLButtonElement>(":scope > .tree-row.root")?.click();
          }
          scheduleDecorate();
        };
      });

      const visibleCount = snapshot.encounters.reduce(
        (count, encounter) => count + (hidden.has(encounter.id) ? 0 : 1),
        0,
      );
      const count = document.querySelector<HTMLElement>(
        ".encounter-browser > .pane-title small",
      );
      if (count) count.textContent = String(visibleCount);
    };

    const scheduleDecorate = () => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(decorate);
    };

    const observer = new MutationObserver(scheduleDecorate);
    observer.observe(document.body, { childList: true, subtree: true });

    let mounted = true;
    void window.analyzer.getInitialState().then((state) => {
      if (!mounted) return;
      snapshot = state.snapshot;
      scheduleDecorate();
    });
    const unsubscribe = window.analyzer.onSnapshot((nextSnapshot) => {
      snapshot = nextSnapshot;
      scheduleDecorate();
    });

    scheduleDecorate();
    return () => {
      mounted = false;
      unsubscribe();
      observer.disconnect();
    };
  }, []);

  return null;
}

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("player detail scrolling styles", () => {
  const css = fs.readFileSync(
    path.resolve(process.cwd(), "src/renderer/styles.css"),
    "utf8",
  );
  const app = fs.readFileSync(
    path.resolve(process.cwd(), "src/renderer/App.tsx"),
    "utf8",
  );
  const main = fs.readFileSync(
    path.resolve(process.cwd(), "src/electron/main.ts"),
    "utf8",
  );
  const packageJson = JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf8"),
  );

  it("keeps the power table inside a constrained scroll container", () => {
    expect(css).toMatch(/\.power-table-panel\s*\{[^}]*display:\s*flex/);
    expect(css).toMatch(/\.power-table-panel\s*>\s*\.power-scroll\s*\{[^}]*height:\s*0/);
    expect(css).toMatch(/\.power-table-panel\s*>\s*\.power-scroll\s*\{[^}]*overflow-y:\s*scroll/);
    expect(css).toMatch(/\.power-grid\s*\{[^}]*width:\s*max-content/);
    expect(css).toMatch(/\.power-grid\s*\{[^}]*min-width:\s*0/);
    expect(css).toMatch(/\.power-grid\s*\{[^}]*table-layout:\s*auto/);
    expect(css).toMatch(/\.power-grid th:first-child,[^{]+\{[^}]*width:\s*190px/);
  });

  it("does not hide optional player columns on narrow windows", () => {
    expect(css).not.toMatch(/\.optional-col\s*\{[^}]*display:\s*none/);
  });

  it("keeps direct and nested player detail tables vertically scrollable", () => {
    expect(css).toMatch(/\.entity-detail\s+\.table-scroll\s*\{[^}]*overflow-y:\s*scroll/);
    expect(css).toMatch(/\.entity-detail\s*>\s*\.table-scroll\s*\{[^}]*height:\s*0/);
    expect(css).toMatch(/\.encounter-hit-panel\s*>\s*\.table-scroll\s*\{[^}]*height:\s*0/);
    expect(css).toMatch(/\.hit-detail-pane\s*>\s*\.table-scroll\s*\{[^}]*height:\s*0/);
  });

  it("keeps the donut and percentage legend fixed inside their panel", () => {
    expect(css).toMatch(/\.donut-legend\s*\{[^}]*overflow:\s*hidden/);
    expect(css).toMatch(/\.donut-visual\s+svg\s*\{[^}]*min-height:\s*0/);
    expect(css).not.toMatch(/\.donut-legend\s*\{[^}]*overflow:\s*auto/);
  });

  it("renders deaths as an enemy-grouped visual table", () => {
    expect(app).toContain('className="death-total-line"');
    expect(app).not.toContain('className="death-summary-strip"');
    expect(app).toContain('className="death-enemy-cell" rowSpan={enemy.powers.length}');
    expect(app).toContain('className="death-count-visual"');
    expect(app).toContain('className="death-victim-entry"');
    expect(app).not.toContain('className="death-victim-chip"');
    expect(app).toContain('localeCompare(right.enemy, "en"');
    expect(app).toContain('death.killerName.replace(/\\s+\\[\\d+\\]\\s*$/, "")');
    expect(css).toMatch(/\.death-victim-list\s*\{[^}]*flex-wrap:\s*wrap/);
    expect(css).toMatch(/\.deaths-grid\s*\{[^}]*min-width:\s*650px/);
  });

  it("starts resizable lower panels near the bottom", () => {
    expect(app).toMatch(/sidebarSplitPercent, setSidebarSplitPercent\] = useState\(72\)/);
    expect(app.match(/tableHeight, setTableHeight\] = useState\(70\)/g)).toHaveLength(1);
  });

  it("lets run headings expand and collapse their encounters", () => {
    expect(app).toContain("collapsedRunIds, setCollapsedRunIds");
    expect(app).toContain("onClick={() => toggleRun(run.id)}");
    expect(app).toContain("aria-expanded={!collapsed}");
    expect(app).toContain("hidden={collapsed}");
  });

  it("removes the ranking bar graph and shows Deflect instead of Effectiveness", () => {
    expect(app).not.toContain("function DamageGraph");
    expect(app).not.toContain("Resize table and damage graph");
    expect(app).toContain('title="Deflect rate">Deflect %');
    expect(app).not.toContain('title="Effectiveness">Eff.');
  });

  it("separates main analysis and entity detail navigation contexts", () => {
    expect(app).toContain('className="analysis-tabs-label"');
    expect(app).toContain('className="analysis-tab-list"');
    expect(app).toContain('className="detail-tab-list"');
    expect(css).toMatch(/\.analysis-tabs-label\s*\{/);
    expect(css).toMatch(/\.detail-entity-name\s*\{[^}]*flex-direction:\s*column/);
  });

  it("removes duplicate main tabs and uses visually distinct workspace tabs", () => {
    expect(app).not.toContain('label: "Raw Data"');
    expect(app).not.toContain('function RawDataTable');
    expect(app).not.toContain('{ id: "damage", label: "Damage" }');
    expect(app).not.toContain('if (tab === "damage")');
    expect(app).not.toContain('className="workspace-nav-dot"');
    expect(css).toMatch(/\.workspace-nav\s*\{[^}]*height:\s*100%/);
    expect(css).toMatch(/\.toolbar-row\s*\{[^}]*background:\s*#e7ebef/);
    expect(css).toMatch(/\.workspace-nav button\s*\{[^}]*border-radius:\s*5px 5px 0 0/);
    expect(css).toMatch(/\.workspace-nav button\s*\{[^}]*background:\s*#d7dde2/);
    expect(css).toMatch(/\.workspace-nav button\.selected\s*\{[^}]*border-bottom-color:\s*#fff/);
    expect(css).toMatch(/\.workspace-nav button\.selected\s*\{[^}]*background:\s*#fff/);
    expect(css).toMatch(/\.workspace-nav button\.selected\s*\{[^}]*box-shadow:\s*inset 0 3px var\(--blue\)/);
    expect(css).not.toMatch(/\.workspace-nav\s*\{[^}]*border-radius:/);
  });

  it("places the Split pets control directly after the analysis tabs", () => {
    expect(app).toContain('className="analysis-pet-toggle"');
    expect(app).not.toContain('className="pet-split-toggle"');
    expect(app.indexOf("ANALYSIS_TABS.map")).toBeLessThan(
      app.indexOf('className="analysis-pet-toggle"'),
    );
    expect(css).toMatch(/\.analysis-pet-toggle\s*\{[^}]*font-weight:\s*650/);
  });

  it("uses the custom Anka icon in the UI and Windows package", () => {
    expect(app).toContain('className="app-emblem" src="./app-icon.png"');
    expect(main).toContain("icon: getAppIconPath()");
    expect(main).toContain('path.join(process.resourcesPath, "icon.png")');
    expect(packageJson.build.win.icon).toBe("build/icon.ico");
    expect(packageJson.build.extraResources[0]).toEqual({
      from: "build/icon.png",
      to: "icon.png",
    });
    expect(fs.existsSync(path.resolve(process.cwd(), "build/icon.ico"))).toBe(true);
    expect(fs.existsSync(path.resolve(process.cwd(), "public/app-icon.png"))).toBe(true);
  });
});

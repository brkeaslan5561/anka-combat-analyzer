import fs from "node:fs/promises";
import path from "node:path";
import type { AppSettings } from "../shared/types";

const DEFAULT_SETTINGS: AppSettings = {
  overlayEnabled: false,
  overlayScale: 1,
  uiResolutionPreset: "1920x1080",
  uiFontSize: "normal",
  timerRules: [],
};

export class SettingsStore {
  private settings: AppSettings = structuredClone(DEFAULT_SETTINGS);

  constructor(private readonly filePath: string) {}

  async load(): Promise<AppSettings> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<AppSettings>;
      this.settings = {
        ...DEFAULT_SETTINGS,
        ...parsed,
        timerRules: Array.isArray(parsed.timerRules) ? parsed.timerRules : [],
      };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw error;
      this.settings = structuredClone(DEFAULT_SETTINGS);
    }
    return this.get();
  }

  get(): AppSettings {
    return structuredClone(this.settings);
  }

  async update(patch: Partial<AppSettings>): Promise<AppSettings> {
    this.settings = {
      ...this.settings,
      ...patch,
      timerRules: patch.timerRules ?? this.settings.timerRules,
    };
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(
      this.filePath,
      `${JSON.stringify(this.settings, null, 2)}\n`,
      "utf8",
    );
    return this.get();
  }
}

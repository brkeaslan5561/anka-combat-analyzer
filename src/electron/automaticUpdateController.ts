import { app, ipcMain, net } from "electron";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const UPDATE_REPOSITORY = "brkeaslan5561/anka-combat-analyzer";
const UPDATE_DIRECTORY = "anka-combat-analyzer-updates";

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  digest?: string | null;
}

interface GithubRelease {
  tag_name: string;
  assets: ReleaseAsset[];
}

export interface AutomaticUpdateResult {
  success: boolean;
  message: string;
}

ipcMain.handle("install-latest-update", async (): Promise<AutomaticUpdateResult> => {
  return installLatestUpdate();
});

void app.whenReady().then(() => cleanupStaleUpdateFiles());

async function installLatestUpdate(): Promise<AutomaticUpdateResult> {
  try {
    const release = await fetchLatestRelease();
    const latestVersion = normalizeVersion(release.tag_name);
    if (compareVersions(latestVersion, app.getVersion()) <= 0) {
      return { success: false, message: "Application is already up to date." };
    }

    const portableTarget = process.env.PORTABLE_EXECUTABLE_FILE?.trim();
    const portable = Boolean(portableTarget);
    const asset = selectUpdateAsset(release.assets, portable);
    if (!asset) {
      return {
        success: false,
        message: portable
          ? "Portable update asset was not found in the latest release."
          : "Setup update asset was not found in the latest release.",
      };
    }

    const response = await net.fetch(asset.browser_download_url, {
      headers: { "User-Agent": "Anka-Combat-Analyzer" },
    });
    if (!response.ok) {
      throw new Error(`Update download failed (${response.status})`);
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    verifyAssetDigest(bytes, asset.digest);

    const updateDirectory = path.join(app.getPath("temp"), UPDATE_DIRECTORY);
    await fs.mkdir(updateDirectory, { recursive: true });
    const safeVersion = latestVersion.replace(/[^0-9A-Za-z._-]/g, "-");
    const downloadedPath = path.join(
      updateDirectory,
      `anka-update-${safeVersion}-${portable ? "portable" : "setup"}.exe`,
    );
    await fs.writeFile(downloadedPath, bytes);

    const scriptPath = path.join(
      updateDirectory,
      `apply-update-${safeVersion}-${Date.now()}.cmd`,
    );
    const restartTarget = portable
      ? portableTarget!
      : app.getPath("exe");
    const script = portable
      ? buildPortableUpdateScript(downloadedPath, restartTarget)
      : buildInstalledUpdateScript(downloadedPath, restartTarget);
    await fs.writeFile(scriptPath, script, "utf8");

    launchDetachedUpdateScript(scriptPath);

    // Give cmd.exe enough time to start before releasing the current executable.
    const quitTimer = setTimeout(() => app.quit(), 350);
    quitTimer.unref?.();

    return {
      success: true,
      message: "Update is being applied in the background. The application will restart automatically.",
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function fetchLatestRelease(): Promise<GithubRelease> {
  const response = await net.fetch(
    `https://api.github.com/repos/${UPDATE_REPOSITORY}/releases/latest`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "Anka-Combat-Analyzer",
      },
    },
  );
  if (!response.ok) {
    throw new Error(`GitHub update check failed (${response.status})`);
  }
  return (await response.json()) as GithubRelease;
}

export function selectUpdateAsset(
  assets: ReleaseAsset[],
  portable: boolean,
): ReleaseAsset | undefined {
  const preferred = portable ? /portable.*\.exe$/i : /setup.*\.exe$/i;
  return (
    assets.find((asset) => preferred.test(asset.name)) ??
    assets.find((asset) => asset.name.toLocaleLowerCase("en-US").endsWith(".exe"))
  );
}

export function verifyAssetDigest(
  bytes: Buffer,
  digest: string | null | undefined,
): void {
  if (!digest?.toLocaleLowerCase("en-US").startsWith("sha256:")) return;
  const expected = digest.slice("sha256:".length).trim().toLocaleLowerCase("en-US");
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== expected) {
    throw new Error("Downloaded update failed SHA-256 verification.");
  }
}

function buildInstalledUpdateScript(setupPath: string, appPath: string): string {
  return [
    "@echo off",
    "setlocal",
    `set "ANKA_SETUP=${escapeBatchValue(setupPath)}"`,
    `set "ANKA_APP=${escapeBatchValue(appPath)}"`,
    "ping 127.0.0.1 -n 3 >nul",
    '"%ANKA_SETUP%" /S',
    "if errorlevel 1 exit /b %errorlevel%",
    'del /f /q "%ANKA_SETUP%" >nul 2>&1',
    'start "" "%ANKA_APP%"',
    'del /f /q "%~f0" >nul 2>&1',
    "endlocal",
    "",
  ].join("\r\n");
}

function buildPortableUpdateScript(sourcePath: string, targetPath: string): string {
  return [
    "@echo off",
    "setlocal EnableDelayedExpansion",
    `set "ANKA_SOURCE=${escapeBatchValue(sourcePath)}"`,
    `set "ANKA_TARGET=${escapeBatchValue(targetPath)}"`,
    "ping 127.0.0.1 -n 3 >nul",
    "set /a ANKA_TRIES=0",
    ":anka_retry",
    'copy /y "%ANKA_SOURCE%" "%ANKA_TARGET%" >nul 2>&1',
    "if not errorlevel 1 goto anka_copied",
    "set /a ANKA_TRIES+=1",
    "if !ANKA_TRIES! GEQ 20 exit /b 1",
    "ping 127.0.0.1 -n 2 >nul",
    "goto anka_retry",
    ":anka_copied",
    'del /f /q "%ANKA_SOURCE%" >nul 2>&1',
    'start "" "%ANKA_TARGET%"',
    'del /f /q "%~f0" >nul 2>&1',
    "endlocal",
    "",
  ].join("\r\n");
}

function launchDetachedUpdateScript(scriptPath: string): void {
  const child = spawn("cmd.exe", ["/d", "/c", scriptPath], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
}

async function cleanupStaleUpdateFiles(): Promise<void> {
  const directory = path.join(app.getPath("temp"), UPDATE_DIRECTORY);
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1_000;
    await Promise.all(
      entries.map(async (entry) => {
        if (!entry.isFile()) return;
        const filePath = path.join(directory, entry.name);
        try {
          const stat = await fs.stat(filePath);
          if (stat.mtimeMs < cutoff) await fs.unlink(filePath);
        } catch {
          // Best-effort temp cleanup only.
        }
      }),
    );
  } catch {
    // The temp update directory may not exist yet.
  }
}

function escapeBatchValue(value: string): string {
  return value.replaceAll("%", "%%");
}

function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/i, "");
}

function compareVersions(left: string, right: string): number {
  const leftParts = normalizeVersion(left).split(".").map(Number);
  const rightParts = normalizeVersion(right).split(".").map(Number);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const leftValue = Number.isFinite(leftParts[index]) ? leftParts[index] : 0;
    const rightValue = Number.isFinite(rightParts[index]) ? rightParts[index] : 0;
    if (leftValue !== rightValue) return leftValue > rightValue ? 1 : -1;
  }
  return 0;
}

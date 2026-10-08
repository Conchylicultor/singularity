import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { z } from "zod";
import { googleMapsDir } from "../../data-dirs";
import type {
  MapsBrowserConfigInput,
  MapsBrowserConfigValue,
} from "../../core";

// Host-global, like the Places key: one file every checkout reads. The name is
// exported so the watcher can pick this file's events out of the directory's.
//
// Functions, not consts: `DataDir.path` is resolved per read because the data
// root is env-overridable, so a path frozen at module eval could be wrong.
export const BROWSER_CONFIG_FILENAME = "browser-config.json";
const configPath = (): string => googleMapsDir.file(BROWSER_CONFIG_FILENAME);

// The on-disk shape. A hand-edited file that no longer parses throws from the
// loader rather than reading as `unset` — a broken file is not "no key". A
// `mapId` written by an older build is stripped on read, and dropped by the
// next save.
const StoredSchema = z.object({
  browserKey: z.string().min(1),
});

export async function readBrowserConfig(): Promise<MapsBrowserConfigValue> {
  let raw: string;
  try {
    raw = await readFile(configPath(), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { kind: "unset" };
    }
    throw err;
  }
  const stored = StoredSchema.parse(JSON.parse(raw));
  return { kind: "set", browserKey: stored.browserKey };
}

/**
 * Replace the stored config. Written to a sibling and renamed over the target,
 * so another checkout's watcher-triggered read never sees a half-written file.
 */
export async function writeBrowserConfig(
  input: MapsBrowserConfigInput,
): Promise<void> {
  googleMapsDir.ensure();
  const target = configPath();
  const staging = `${target}.${process.pid}.tmp`;
  await writeFile(staging, JSON.stringify(input, null, 2));
  await rename(staging, target);
}

export async function clearBrowserConfig(): Promise<void> {
  await rm(configPath(), { force: true });
}

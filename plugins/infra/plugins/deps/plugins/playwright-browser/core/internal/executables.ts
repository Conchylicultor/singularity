import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

/**
 * The record a `playwright-browser` install leaves in its `env/`: the browser
 * executables AS PLAYWRIGHT REPORTED THEM for that install's browsers path.
 * Recorded, never re-derived — Playwright is the only authority on which
 * files a given version launches (the headed binary for a headed launch, the
 * `chrome-headless-shell` of the same revision for a headless one).
 */
export const BROWSER_EXECUTABLES_FILE = "executables.json";

export const BrowserExecutablesSchema = z.object({
  /** The `playwright-core` version that installed (and reported) them. */
  playwrightCore: z.string(),
  /** What a HEADED launch runs (`Google Chrome for Testing` on macOS). */
  headed: z.string(),
  /** What a HEADLESS launch runs (`chrome-headless-shell`). */
  headlessShell: z.string(),
});
export type BrowserExecutables = z.infer<typeof BrowserExecutablesSchema>;

export type ReadBrowserExecutables =
  { ok: true; executables: BrowserExecutables } | { ok: false; reason: string };

/**
 * Read the record from an install's `env/`, and check that both executables
 * it names still exist. Synchronous and cheap (one small read, two stats): it
 * is the kind's `isIntact`, which runs on every `ensureDep` fast path and
 * every state read.
 */
export function readBrowserExecutables(envDir: string): ReadBrowserExecutables {
  const file = join(envDir, BROWSER_EXECUTABLES_FILE);
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { ok: false, reason: `${file} does not exist` };
    }
    throw err;
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    if (err instanceof SyntaxError) {
      return { ok: false, reason: `${file} is not JSON: ${err.message}` };
    }
    throw err;
  }
  const parsed = BrowserExecutablesSchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      reason: `${file} is not a browser-executables record: ${parsed.error.message}`,
    };
  }
  for (const [role, path] of [
    ["headed", parsed.data.headed],
    ["headless-shell", parsed.data.headlessShell],
  ] as const) {
    if (!existsSync(path)) {
      return {
        ok: false,
        reason: `the ${role} executable ${path} recorded in ${file} is gone`,
      };
    }
  }
  return { ok: true, executables: parsed.data };
}

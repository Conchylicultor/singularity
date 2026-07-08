// Standalone subprocess for the cold-seed / bulk pricing pass.
//
// ccusage's `loadSessionData` parses the ENTIRE ~/.claude/projects tree with its
// own unbounded internal pipeline — running it inline on the backend freezes the
// event loop (~9.8s) and spikes memory (~3.3GB). We run it here, in a throwaway
// child process, so the heavy parse never touches the serving loop and the
// child's memory is reclaimed on exit.
//
// This script is spawned directly with bun (NOT bundled into the server), so it
// imports ccusage straight from the plugin's node_modules. The result map is
// written to the file path given as argv[2] — NOT stdout: ccusage's pricing
// fetcher logs `Loaded pricing for N models` to stdout via its own consola
// instance (uninjectable through the public API), which would corrupt a stdout
// payload. On success it writes the file and exits 0; on any failure it writes
// nothing and exits 1 (fail loud).
import { loadSessionData } from "ccusage/data-loader";

const outPath = process.argv[2];
if (!outPath) {
  console.error("bulk-price: missing output path argument");
  process.exit(1);
}

// `~/.claude/projects` churns while agents create/remove worktrees, so a session
// file can vanish between ccusage's glob and its read → a transient ENOENT that
// aborts the whole parse. A re-glob on retry sees the now-current tree, so a few
// bounded retries clear the race; we still exit 1 (fail loud) if it persists.
const MAX_ATTEMPTS = 3;

async function run(): Promise<Map<string, number>> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const rows = await loadSessionData({ mode: "auto" });
      const map = new Map<string, number>();
      for (const r of rows) {
        // `row.sessionId` is the project-dir key for the 2-level Claude layout
        // (see ccusage-cost-source.ts).
        map.set(r.sessionId, (map.get(r.sessionId) ?? 0) + r.totalCost);
      }
      return map;
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_ATTEMPTS) await Bun.sleep(250 * attempt);
    }
  }
  throw lastErr;
}

try {
  const map = await run();
  await Bun.write(outPath, JSON.stringify([...map.entries()]));
  process.exit(0);
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

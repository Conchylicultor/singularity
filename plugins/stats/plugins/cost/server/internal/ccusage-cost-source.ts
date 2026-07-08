import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFile, rm } from "node:fs/promises";
import type { CostSource } from "./usage-index";

// The real pricing source: ccusage with ONLINE LiteLLM pricing (mode "auto"),
// the only source that knows current models. Offline pricing returns $0 for any
// model newer than ccusage's bundled snapshot, so it is deliberately NOT used.
//
// The whole-corpus parse runs in a throwaway subprocess: ccusage's own
// `loadSessionData` parse is unbounded and would freeze the backend event loop
// (~9.8s) and spike memory (~3.3GB) if run inline. The child does the heavy
// parse and its memory is reclaimed on exit. This is the ONLY pricing path:
// the former per-file, on-loop ccusage lookup re-globbed the whole 2.3GB tree
// even for a miss (~0.6s of loop lag per changed file), so it was removed
// entirely. `server/internal/` → plugin root is two levels up, then into
// `scripts/`.
const BULK_PRICE_PATH = join(import.meta.dir, "..", "..", "scripts", "bulk-price.ts");

export const ccusageCostSource: CostSource = {
  async bulkProjectCosts(): Promise<Map<string, number>> {
    // The child writes the result to a temp file rather than stdout: ccusage's
    // pricing fetcher logs to stdout via its own (uninjectable) logger, which
    // would corrupt a stdout payload. We discard the child's stdout entirely.
    const outPath = join(tmpdir(), `cost-bulk-${crypto.randomUUID()}.json`);
    const proc = Bun.spawn([process.execPath, BULK_PRICE_PATH, outPath], {
      stdout: "ignore",
      stderr: "pipe",
    });
    const [err, code] = await Promise.all([
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    if (code !== 0) {
      // Fail loud — a broken subprocess must surface, not silently fall back to
      // an inline parse (which would reintroduce the freeze).
      throw new Error(
        `bulk-price subprocess exited ${code}: ${err.trim() || "no output"}`,
      );
    }
    try {
      const raw = await readFile(outPath, "utf8");
      return new Map(JSON.parse(raw) as [string, number][]);
    } finally {
      await rm(outPath, { force: true });
    }
  },
};

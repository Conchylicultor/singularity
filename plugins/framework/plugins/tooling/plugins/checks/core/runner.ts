import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { loadCollectedDir } from "@plugins/framework/plugins/tooling/plugins/collected-dir/core";
import type { Check, CheckResult } from "@plugins/framework/plugins/tooling/core";
import { computeTreeHash } from "./tree-hash";
import { openCheckCache } from "./cache";
import { withScanTree } from "./scan-context";

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

function isCheck(value: unknown): value is Check {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Check).id === "string" &&
    typeof (value as Check).description === "string" &&
    typeof (value as Check).run === "function"
  );
}

async function loadAllChecks(): Promise<Check[]> {
  const { checkEntries } = await import("./check.generated");
  return loadCollectedDir<Check>(checkEntries, {
    isItem: isCheck,
    dedupeKey: (c) => c.id,
    label: "check",
  });
}

export async function listAllChecks(): Promise<Check[]> {
  return loadAllChecks();
}

export interface RunChecksOptions {
  onCheckDone?: (id: string, durationMs: number, wallStartMs: number) => void;
  log: (line: string, stream: "stdout" | "stderr") => void;
  /** Bypass the tree-hash result cache entirely (lookup + record). */
  noCache?: boolean;
  /**
   * Absolute path to write the FULL, untruncated results to. The console
   * (`log`) output stays summarized/truncated so it doesn't flood an agent's
   * context (and survives being piped through `tail`); the file holds the
   * complete failure messages so they can be read directly. When set, the
   * console truncation note points at this file instead of telling the caller
   * to re-run.
   */
  logFile?: string;
}

export async function runChecks(ids: string[] | undefined, options: RunChecksOptions): Promise<boolean> {
  const all = await listAllChecks();

  const selected = ids && ids.length > 0
    ? all.filter((c) => ids.includes(c.id))
    : all;

  if (ids && selected.length !== ids.length) {
    const known = new Set(all.map((c) => c.id));
    const unknown = ids.filter((id) => !known.has(id));
    console.error(`Unknown check(s): ${unknown.join(", ")}`);
    return false;
  }

  const noCache = options?.noCache || process.env.SINGULARITY_CHECK_NO_CACHE === "1";
  const treeHash = noCache ? null : await computeTreeHash(await getRoot());
  const cache = treeHash ? openCheckCache() : null;

  const results = await Promise.all(
    selected.map(async (check) => {
      const wallStart = performance.now();

      // A check opts out of caching by returning null from cacheSignature();
      // absent → "" (keyed on tree hash alone). The runner never names checks.
      let sig: string | null = "";
      if (check.cacheSignature) {
        try {
          sig = check.cacheSignature();
        // eslint-disable-next-line promise-safety/no-bare-catch -- cacheSignature() failure of any kind safely degrades to uncached; propagating would abort the check run, which is a worse outcome than skipping the cache
        } catch {
          sig = null;
        }
      }
      // Narrow inline (not via a stored boolean) so TS sees cache/treeHash/sig
      // as non-null in the guarded branches.
      if (cache !== null && treeHash !== null && sig !== null && cache.has(check.id, treeHash, sig)) {
        const result: CheckResult = { ok: true };
        return { check, result, durationMs: Math.round(performance.now() - wallStart), wallStart, cached: true };
      }

      // Scan the SAME tree the cache key (treeHash) is computed from, so a
      // recorded PASS always reflects content the check actually inspected.
      const result = await withScanTree(treeHash, () => check.run());
      const durationMs = Math.round(performance.now() - wallStart);
      // Cache PASSES only — failures must always re-run with full output.
      if (cache !== null && treeHash !== null && sig !== null && result.ok) {
        cache.record(check.id, treeHash, sig);
      }
      return { check, result, durationMs, wallStart, cached: false };
    }),
  );

  const log = options.log;
  const logFile = options.logFile;

  // Full, untruncated transcript mirrored to `logFile`. Every line emitted to
  // the console is also recorded here verbatim; failure messages are recorded
  // in full even when the console copy is truncated.
  const full: string[] = [];
  const emit = (line: string, stream: "stdout" | "stderr") => {
    log(line, stream);
    full.push(line);
  };

  const MAX_MESSAGE_LINES = 100;

  let allOk = true;
  for (const { check, result, durationMs, wallStart, cached } of results) {
    options?.onCheckDone?.(check.id, durationMs, wallStart);
    if (result.ok) {
      emit(`• ${check.id} ... ok${cached ? " (cached)" : ""}`, "stdout");
    } else {
      allOk = false;
      emit(`• ${check.id} ... FAIL`, "stdout");
      const indented = `  ${result.message.split("\n").join("\n  ")}`;
      const lines = result.message.split("\n");
      if (lines.length > MAX_MESSAGE_LINES) {
        const head = lines.slice(0, 50).join("\n");
        const tail = lines.slice(-50).join("\n");
        const omitted = lines.length - 100;
        const moreHint = logFile
          ? `see ${logFile} for full output`
          : `re-run \`./singularity check ${check.id}\` for full output`;
        // Truncated copy to the console; full copy to the file.
        log(`  ${head}\n  ... (${omitted} lines omitted — ${moreHint})\n  ${tail}`, "stderr");
        full.push(indented);
      } else {
        emit(`  ${result.message}`, "stderr");
      }
      if (result.hint) emit(`  hint: ${result.hint}`, "stderr");
    }
  }
  if (!allOk) {
    emit(
      "\nIf you cannot fix the failing check(s): STOP, report the failure to the user, and wait for instructions. " +
        "Do NOT work around check failures — not by disabling checks, editing check code, " +
        "expanding skip lists, committing via raw git, or any other means.",
      "stderr",
    );
  }

  if (logFile) {
    mkdirSync(dirname(logFile), { recursive: true });
    writeFileSync(logFile, full.join("\n") + "\n");
  }

  return allOk;
}

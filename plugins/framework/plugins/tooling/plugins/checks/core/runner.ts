import { loadCollectedDir } from "@plugins/framework/plugins/tooling/plugins/collected-dir/core";
import type { Check, CheckResult } from "./types";
import { computeTreeHash } from "./tree-hash";
import { openCheckCache } from "./cache";

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

      const result = await check.run();
      const durationMs = Math.round(performance.now() - wallStart);
      // Cache PASSES only — failures must always re-run with full output.
      if (cache !== null && treeHash !== null && sig !== null && result.ok) {
        cache.record(check.id, treeHash, sig);
      }
      return { check, result, durationMs, wallStart, cached: false };
    }),
  );

  const log = options.log;

  const MAX_MESSAGE_LINES = 100;

  let allOk = true;
  for (const { check, result, durationMs, wallStart, cached } of results) {
    options?.onCheckDone?.(check.id, durationMs, wallStart);
    if (result.ok) {
      log(`• ${check.id} ... ok${cached ? " (cached)" : ""}`, "stdout");
    } else {
      allOk = false;
      log(`• ${check.id} ... FAIL`, "stdout");
      const lines = result.message.split("\n");
      if (lines.length > MAX_MESSAGE_LINES) {
        const head = lines.slice(0, 50).join("\n");
        const tail = lines.slice(-50).join("\n");
        const omitted = lines.length - 100;
        log(`  ${head}\n  ... (${omitted} lines omitted — re-run \`./singularity check ${check.id}\` for full output)\n  ${tail}`, "stderr");
      } else {
        log(`  ${result.message}`, "stderr");
      }
      if (result.hint) log(`  hint: ${result.hint}`, "stderr");
    }
  }
  if (!allOk) {
    log(
      "\nIf you cannot fix the failing check(s): STOP, report the failure to the user, and wait for instructions. " +
        "Do NOT work around check failures — not by disabling checks, editing check code, " +
        "expanding skip lists, committing via raw git, or any other means.",
      "stderr",
    );
  }
  return allOk;
}

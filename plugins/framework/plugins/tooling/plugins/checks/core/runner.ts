import type { Check } from "./types";

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
  const results = await Promise.allSettled(
    checkEntries.map((e: { pluginPath: string; loader: () => Promise<{ default: unknown }> }) => e.loader()),
  );
  const out: Check[] = [];
  const seenIds = new Set<string>();
  for (let i = 0; i < results.length; i++) {
    const r = results[i]!;
    const e = checkEntries[i]!;
    if (r.status === "rejected") {
      console.warn(`[check] failed: ${e.pluginPath}`, r.reason);
      continue;
    }
    const exported = (r.value as { default?: unknown }).default;
    const checks = Array.isArray(exported) ? exported : exported ? [exported] : [];
    for (const c of checks) {
      if (!isCheck(c) || seenIds.has(c.id)) continue;
      seenIds.add(c.id);
      out.push(c);
    }
  }
  return out;
}

export async function listAllChecks(): Promise<Check[]> {
  return loadAllChecks();
}

export interface RunChecksOptions {
  onCheckDone?: (id: string, durationMs: number, wallStartMs: number) => void;
  log?: (line: string, stream: "stdout" | "stderr") => void;
}

export async function runChecks(ids?: string[], options?: RunChecksOptions): Promise<boolean> {
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

  const results = await Promise.all(
    selected.map(async (check) => {
      const wallStart = performance.now();
      const result = await check.run();
      const durationMs = Math.round(performance.now() - wallStart);
      return { check, result, durationMs, wallStart };
    }),
  );

  const log = options?.log ?? ((line: string, stream: "stdout" | "stderr") =>
    stream === "stderr" ? console.error(line) : console.log(line));

  const MAX_MESSAGE_LINES = 100;

  let allOk = true;
  for (const { check, result, durationMs, wallStart } of results) {
    options?.onCheckDone?.(check.id, durationMs, wallStart);
    if (result.ok) {
      log(`• ${check.id} ... ok`, "stdout");
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

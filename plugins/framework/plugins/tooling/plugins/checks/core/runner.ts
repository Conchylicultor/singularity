import { existsSync, readdirSync } from "fs";
import { join, relative } from "path";
import type { Check } from "./types";

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

function findCheckBarrels(dir: string): string[] {
  const out: string[] = [];
  function walk(d: string, depth: number) {
    if (depth > 12) return;
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (e.name === "node_modules" || e.name === "dist" || e.name === ".git") continue;
      const child = join(d, e.name);
      if (e.name === "check") {
        const barrel = join(child, "index.ts");
        if (existsSync(barrel)) out.push(barrel);
      } else {
        walk(child, depth + 1);
      }
    }
  }
  walk(dir, 0);
  return out;
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

async function loadAllChecks(root: string): Promise<Check[]> {
  const pluginsRoot = join(root, "plugins");
  if (!existsSync(pluginsRoot)) return [];

  const checkBarrels = findCheckBarrels(pluginsRoot);
  checkBarrels.sort();

  const out: Check[] = [];
  const seenIds = new Set<string>();

  for (const barrel of checkBarrels) {
    const rel = relative(pluginsRoot, barrel);
    let mod: { default?: unknown };
    try {
      mod = await import(barrel);
    } catch (err) {
      console.warn(`  [check loader] failed to import ${rel}: ${err}`);
      continue;
    }
    const exported = mod.default;
    const checks = Array.isArray(exported) ? exported : exported ? [exported] : [];
    for (const c of checks) {
      if (!isCheck(c)) {
        console.warn(`  [check loader] ${rel}: skipping non-Check export`);
        continue;
      }
      if (seenIds.has(c.id)) {
        console.warn(`  [check loader] ${rel}: duplicate id "${c.id}"; skipping`);
        continue;
      }
      seenIds.add(c.id);
      out.push(c);
    }
  }
  return out;
}

export async function listAllChecks(): Promise<Check[]> {
  const root = await getRoot();
  return loadAllChecks(root);
}

export interface RunChecksOptions {
  onCheckDone?: (id: string, durationMs: number, wallStartMs: number) => void;
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

  let allOk = true;
  for (const { check, result, durationMs, wallStart } of results) {
    options?.onCheckDone?.(check.id, durationMs, wallStart);
    if (result.ok) {
      console.log(`• ${check.id} ... ok`);
    } else {
      allOk = false;
      console.log(`• ${check.id} ... FAIL`);
      console.error(`  ${result.message}`);
      if (result.hint) console.error(`  hint: ${result.hint}`);
    }
  }
  if (!allOk) {
    console.error(
      "\nIf you cannot fix the failing check(s): STOP, report the failure to the user, and wait for instructions. " +
        "Do NOT work around check failures — not by disabling checks, editing check code, " +
        "expanding skip lists, committing via raw git, or any other means.",
    );
  }
  return allOk;
}

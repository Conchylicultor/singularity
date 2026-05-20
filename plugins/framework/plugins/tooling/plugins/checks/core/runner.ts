import { existsSync } from "fs";
import { join, sep } from "path";
import { buildPluginTree } from "@plugins/plugin-meta/plugins/plugin-tree/core";
import type { Check } from "./types";

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

async function loadAllChecks(root: string): Promise<Check[]> {
  const pluginsRoot = join(root, "plugins");
  if (!existsSync(pluginsRoot)) return [];

  const tree = buildPluginTree(pluginsRoot);
  const out: Check[] = [];
  const seenIds = new Set<string>();

  for (const node of tree.byDir.values()) {
    const checkBarrel = join(node.dir, "check", "index.ts");
    if (!existsSync(checkBarrel)) continue;
    const pluginRel = node.dir
      .slice(pluginsRoot.length + 1)
      .split(sep)
      .join("/");
    let mod: { default?: unknown };
    try {
      mod = await import(checkBarrel);
    } catch (err) {
      console.warn(`  [check loader] failed to import ${pluginRel}/check/index.ts: ${err}`);
      continue;
    }
    const exported = mod.default;
    const checks = Array.isArray(exported) ? exported : exported ? [exported] : [];
    for (const c of checks) {
      if (!isCheck(c)) {
        console.warn(`  [check loader] ${pluginRel}/check/index.ts: skipping non-Check export`);
        continue;
      }
      if (seenIds.has(c.id)) {
        console.warn(`  [check loader] ${pluginRel}/check: duplicate id "${c.id}"; skipping`);
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

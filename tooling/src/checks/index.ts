import { existsSync } from "fs";
import { join, sep } from "path";
import { buildPluginTree } from "@plugins/plugin-meta/plugins/plugin-tree/core";
import { boundaryRulesCheck } from "@plugins/framework/plugins/tooling/plugins/boundaries/core";
import { allowDefaultProjectInSync } from "./allow-default-project";
import { configOriginsInSync } from "./config-origins-in-sync";
import { conversationTrailer } from "./conversation-trailer";
import { eslintCheck } from "./eslint";
import { migrationsInSync } from "./migrations-in-sync";
import { noRawEventSource } from "./no-raw-event-source";
import { noRawSse } from "./no-raw-sse";
import { noPluginImportsInCore } from "./no-plugin-imports-in-core";
import { noPluginWorkspaceDeps } from "./no-plugin-workspace-deps";
import { noRawWebsocket } from "./no-raw-websocket";
import { noReexportDefault } from "./no-reexport-default";
import { noRelativeServerImports } from "./no-relative-server-imports";
import { noUseResourceCast } from "./no-use-resource-cast";
import { pluginBoundaries } from "./plugin-boundaries";
import { typescript } from "./typescript";
import { pluginsDocInSync } from "./plugins-doc-in-sync";
import { pluginsHaveClaudeMd } from "./plugins-have-claudemd";
import { pluginsRegistryInSync } from "./plugins-registry-in-sync";
import { snapshotChainIntact } from "./snapshot-chain-intact";
import type { Check } from "./types";

export const CHECKS: Check[] = [
  allowDefaultProjectInSync,
  conversationTrailer,
  configOriginsInSync,
  migrationsInSync,
  snapshotChainIntact,
  pluginsDocInSync,
  pluginsRegistryInSync,
  pluginsHaveClaudeMd,
  pluginBoundaries,
  boundaryRulesCheck,
  noPluginImportsInCore,
  noPluginWorkspaceDeps,
  noRawEventSource,
  noRawSse,
  noRawWebsocket,
  noReexportDefault,
  noRelativeServerImports,
  noUseResourceCast,
  typescript,
  eslintCheck,
];

export type { Check, CheckResult } from "./types";

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

/**
 * Discover per-plugin custom checks. Each plugin may export a `check/index.ts`
 * whose default export is `Check | Check[]`. Discovery is purely runtime —
 * no codegen, no registry file. Built-in checks always win on id collision.
 */
async function loadPluginChecks(root: string): Promise<Check[]> {
  const pluginsRoot = join(root, "plugins");
  if (!existsSync(pluginsRoot)) return [];
  const builtInIds = new Set(CHECKS.map((c) => c.id));
  const out: Check[] = [];
  const tree = buildPluginTree(pluginsRoot);
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
      if (builtInIds.has(c.id)) {
        console.warn(
          `  [check loader] ${pluginRel}/check: id "${c.id}" collides with a built-in; skipping`,
        );
        continue;
      }
      out.push(c);
    }
  }
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

export async function listAllChecks(): Promise<Check[]> {
  const root = await getRoot();
  const pluginChecks = await loadPluginChecks(root);
  return [...CHECKS, ...pluginChecks];
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

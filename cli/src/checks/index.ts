import { existsSync, readdirSync } from "fs";
import { join, sep } from "path";
import { conversationTrailer } from "./conversation-trailer";
import { eslintCheck } from "./eslint";
import { migrationsInSync } from "./migrations-in-sync";
import { noRawEventSource } from "./no-raw-event-source";
import { noRawSse } from "./no-raw-sse";
import { noPluginImportsInCore } from "./no-plugin-imports-in-core";
import { noPluginWorkspaceDeps } from "./no-plugin-workspace-deps";
import { noRawWebsocket } from "./no-raw-websocket";
import { noRelativeServerImports } from "./no-relative-server-imports";
import { noUseResourceCast } from "./no-use-resource-cast";
import { pluginBoundaries } from "./plugin-boundaries";
import { typescript } from "./typescript";
import { pluginsDocInSync } from "./plugins-doc-in-sync";
import { pluginsHaveClaudeMd } from "./plugins-have-claudemd";
import { snapshotChainIntact } from "./snapshot-chain-intact";
import type { Check } from "./types";

export const CHECKS: Check[] = [
  conversationTrailer,
  migrationsInSync,
  snapshotChainIntact,
  pluginsDocInSync,
  pluginsHaveClaudeMd,
  pluginBoundaries,
  noPluginImportsInCore,
  noPluginWorkspaceDeps,
  noRawEventSource,
  noRawSse,
  noRawWebsocket,
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
 * Walk plugins/ for any directory that looks like a plugin (has web/server/central/index.ts)
 * and yield its absolute path. Mirrors `findAllPluginDirs` in docgen.ts and `discoverPlugins`
 * in plugin-boundaries.ts — kept local to avoid an internal dep on either.
 */
function findPluginDirs(pluginsRoot: string): string[] {
  const out: string[] = [];
  function walk(dir: string, depth: number) {
    if (depth > 10) return;
    const hasWeb = existsSync(join(dir, "web", "index.ts"));
    const hasServer = existsSync(join(dir, "server", "index.ts"));
    const hasCentral = existsSync(join(dir, "central", "index.ts"));
    if ((hasWeb || hasServer || hasCentral) && dir !== pluginsRoot) out.push(dir);
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (dir === pluginsRoot) walk(join(dir, e.name), depth + 1);
      else if (e.name === "plugins") {
        for (const c of readdirSync(join(dir, e.name), { withFileTypes: true })) {
          if (c.isDirectory()) walk(join(dir, e.name, c.name), depth + 1);
        }
      }
    }
  }
  walk(pluginsRoot, 0);
  return out;
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
  for (const pluginDir of findPluginDirs(pluginsRoot)) {
    const checkBarrel = join(pluginDir, "check", "index.ts");
    if (!existsSync(checkBarrel)) continue;
    const pluginRel = pluginDir
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

export async function runChecks(ids?: string[]): Promise<boolean> {
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

  let allOk = true;
  for (const check of selected) {
    process.stdout.write(`• ${check.id} ... `);
    const result = await check.run();
    if (result.ok) {
      console.log("ok");
    } else {
      allOk = false;
      console.log("FAIL");
      console.error(`  ${result.message}`);
      if (result.hint) console.error(`  hint: ${result.hint}`);
    }
  }
  return allOk;
}

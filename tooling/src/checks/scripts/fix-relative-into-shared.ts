#!/usr/bin/env bun
/**
 * Fix all `relative-into-shared` plugin-boundary violations by replacing
 * relative `../shared` imports with the `@plugins/<name>/shared` alias.
 *
 * Usage:
 *   bun tooling/src/checks/scripts/fix-relative-into-shared.ts           # apply fixes
 *   bun tooling/src/checks/scripts/fix-relative-into-shared.ts --dry-run # preview only
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { dirname, join, relative, resolve, sep } from "path";
import { buildPluginTree } from "@plugins/plugin-meta/plugins/plugin-tree/core";

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

const SOURCE_ROOTS = ["plugins", "web/src", "server/src", "central/src"];
const IGNORED_DIRS = new Set(["node_modules", "dist", "build", ".git"]);

function walkTs(dir: string, out: string[]) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (IGNORED_DIRS.has(e.name)) continue;
      walkTs(join(dir, e.name), out);
    } else if (e.isFile() && (e.name.endsWith(".ts") || e.name.endsWith(".tsx"))) {
      out.push(join(dir, e.name));
    }
  }
}

function pluginForPath(relFile: string, pluginSet: Set<string>): string | null {
  const norm = relFile.split(sep).join("/");
  if (!norm.startsWith("plugins/")) return null;
  const rest = norm.slice("plugins/".length);
  const parts = rest.split("/");
  let best: string | null = null;
  for (let i = 1; i <= parts.length; i++) {
    const candidate = parts.slice(0, i).join("/");
    if (pluginSet.has(candidate)) best = candidate;
  }
  return best;
}

function extractRelativeImports(src: string): string[] {
  const withFromRe =
    /^[ \t]*(?:import|export)\s+[\s\S]*?\s+from\s+["'](\.\.?\/[^"']*)["']/gm;
  const bareRe = /^[ \t]*import\s+["'](\.\.?\/[^"']*)["']/gm;
  const results = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = withFromRe.exec(src))) results.add(m[1]!);
  while ((m = bareRe.exec(src))) results.add(m[1]!);
  return [...results];
}

const dryRun = process.argv.includes("--dry-run");
const root = await getRoot();
const pluginsRoot = join(root, "plugins");
const tree = buildPluginTree(pluginsRoot);
const pluginSet = new Set(Array.from(tree.byDir.values()).map((n) => n.path));

const files: string[] = [];
for (const r of SOURCE_ROOTS) {
  const abs = join(root, r);
  if (existsSync(abs)) walkTs(abs, files);
}

let totalFixes = 0;
let totalFiles = 0;

for (const absFile of files) {
  const relFile = relative(root, absFile).split(sep).join("/");
  const sourcePlugin = pluginForPath(relFile, pluginSet);
  if (!sourcePlugin) continue;

  const sharedPrefix = `plugins/${sourcePlugin}/shared`;
  if (relFile.startsWith(sharedPrefix + "/")) continue;

  const src = readFileSync(absFile, "utf-8");
  const replacements: Array<{ from: string; to: string }> = [];

  for (const relImp of extractRelativeImports(src)) {
    const resolvedAbs = resolve(dirname(absFile), relImp);
    const resolvedRel = relative(root, resolvedAbs).split(sep).join("/");
    if (resolvedRel !== sharedPrefix && !resolvedRel.startsWith(sharedPrefix + "/")) continue;

    const suffix = resolvedRel.slice(sharedPrefix.length); // "" or "/foo/bar"
    replacements.push({ from: relImp, to: `@plugins/${sourcePlugin}/shared${suffix}` });
  }

  if (replacements.length === 0) continue;

  let newSrc = src;
  for (const { from, to } of replacements) {
    newSrc = newSrc.replaceAll(`"${from}"`, `"${to}"`).replaceAll(`'${from}'`, `'${to}'`);
    console.log(`  ${relFile}: "${from}" → "${to}"`);
    totalFixes++;
  }

  totalFiles++;
  if (!dryRun) writeFileSync(absFile, newSrc, "utf-8");
}

const prefix = dryRun ? "[dry-run] " : "";
console.log(`\n${prefix}${totalFixes} fix(es) in ${totalFiles} file(s).`);

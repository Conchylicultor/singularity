import { isTestCodePath } from "@plugins/framework/plugins/plugin-id/core";
import {
  listCandidateSources,
  type CandidateSource,
} from "@plugins/framework/plugins/tooling/plugins/checks/core";
import {
  findImports,
  lineAt,
  maskSource,
} from "@plugins/plugin-meta/plugins/parse-utils/core";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = {
  id: string;
  description: string;
  inputKeyed?: boolean;
  run(): Promise<CheckResult>;
};

// A contributed-column handle (`liveColumns`, in a contributor's core) is only
// the declaration: its values reach the wire when the contributor's server
// serves it (`serveColumns(handle, …)` in a `LiveColumns.Serve` contribution).
// A handle nothing serves type-checks, bundles and renders — and fails every
// query that names its columns with a decode error, at the first use. This
// check makes that a build error instead: every handle has a
// `serveColumns(<handle>` in its own plugin's `server/`.
//
// Both halves are read off whole files with comments and strings masked, so a
// declaration or a call wrapped over lines still reads, and a served handle is
// resolved through the serving file's import bindings (`import { x as y }` →
// `serveColumns(y` serves `x`). Test code neither declares nor serves.

/** A `liveColumns(` call — not the function's own definition. */
const CALL = /(?<!\bfunction\s+)\bliveColumns\s*(?:<[^()]*>)?\s*\(/g;
/** The binding a call is the initializer of: `const x =` / `const x: T =` right before it. */
const BOUND = /\bconst\s+(\w+)\s*(?::[^=;]*)?=\s*$/;
/** A `serveColumns(<identifier>` call: the handle it serves. */
const SERVE = /\bserveColumns\s*(?:<[^()]*>)?\s*\(\s*(\w+)/g;

/** Test code neither declares a handle nor serves one. */
const notTest = (f: CandidateSource) => !isTestCodePath(f.rel.split("/"));

/** The plugin root of a repo-relative path: everything before its first runtime folder. */
function pluginRootOf(path: string): string | null {
  const at = path.search(/\/(core|web|shared|server)\//);
  return at === -1 ? null : path.slice(0, at);
}

/** Every handle a declaring file mints, or the call no `const` binds (named by line). */
function declaredIn(
  file: CandidateSource,
): { name: string | null; line: number }[] {
  const masked = maskSource(file.src);
  const out: { name: string | null; line: number }[] = [];
  for (const m of masked.matchAll(CALL)) {
    // The binding sits right before the call; a bounded look-back keeps the
    // end-anchored match linear in the file.
    const before = masked.slice(Math.max(0, m.index - 400), m.index);
    const name = BOUND.exec(before)?.[1] ?? null;
    out.push({ name, line: lineAt(file.src, m.index) });
  }
  return out;
}

/** The handles a serving file serves, by the name they are EXPORTED under (import aliases undone). */
function servedIn(file: CandidateSource): Set<string> {
  const masked = maskSource(file.src);
  // Local binding → imported name, from every `import { a as b }`.
  const imported = new Map<string, string>();
  for (const imp of findImports(file.src)) {
    const braces = /\{([^}]*)\}/.exec(imp.clause)?.[1];
    if (braces === undefined) continue;
    for (const spec of braces.split(",")) {
      const m = /^\s*(?:type\s+)?(\w+)(?:\s+as\s+(\w+))?\s*$/.exec(spec);
      if (m) imported.set(m[2] ?? m[1]!, m[1]!);
    }
  }
  const out = new Set<string>();
  for (const m of masked.matchAll(SERVE)) {
    const local = m[1]!;
    out.add(imported.get(local) ?? local);
  }
  return out;
}

/**
 * The declared handles (outside test code) no `serveColumns(<handle>` in the same plugin's
 * `server/` serves outside test code — and every `liveColumns(` call no `const` binds (the check
 * cannot tell which handle it is) — as `path:line — name`.
 */
export function unservedHandles(
  declaring: readonly CandidateSource[],
  serving: readonly CandidateSource[],
): string[] {
  const servedByPlugin = new Map<string, Set<string>>();
  for (const file of serving.filter(notTest)) {
    const root = pluginRootOf(file.rel);
    if (root === null || !file.rel.startsWith(`${root}/server/`)) continue;
    const set = servedByPlugin.get(root) ?? new Set<string>();
    for (const name of servedIn(file)) set.add(name);
    servedByPlugin.set(root, set);
  }
  const missing: string[] = [];
  for (const file of declaring.filter(notTest)) {
    const root = pluginRootOf(file.rel);
    for (const { name, line } of declaredIn(file)) {
      if (name === null) {
        missing.push(
          `${file.rel}:${line} — a liveColumns(…) call no \`const\` binds`,
        );
        continue;
      }
      if (root !== null && servedByPlugin.get(root)?.has(name)) continue;
      missing.push(`${file.rel}:${line} — ${name}`);
    }
  }
  return missing;
}

const contributedColumnsServed: Check = {
  id: "live:contributed-columns-served",
  // INPUT-KEYED: a pure scan of tracked sources.
  inputKeyed: true,
  description:
    "Every contributed-column handle (`const x = liveColumns(…)`, network/live) is served by its own plugin's server: a `serveColumns(x` (through any import alias) in that plugin's `server/`, outside test code. An unserved handle's columns reach no row, and every query naming them fails to decode.",
  async run() {
    const root = await getWorktreeRoot();
    const declaring = await listCandidateSources({
      root,
      grepArg: "liveColumns",
      fixed: true,
    });
    const serving = await listCandidateSources({
      root,
      grepArg: "serveColumns",
      fixed: true,
    });
    const missing = unservedHandles(declaring, serving);
    if (missing.length === 0) return { ok: true };
    return {
      ok: false,
      message: `${missing.length} contributed-column handle(s) are served by no server:\n    ${missing.join("\n    ")}`,
      hint: "Bind each handle to a `const` in the contributor's core, and in that plugin's server barrel contribute `LiveColumns.Serve(serveColumns(handle, { join: ext.join(\"<alias>\") }))` (network/live/server).",
    };
  },
};

export default [contributedColumnsServed];

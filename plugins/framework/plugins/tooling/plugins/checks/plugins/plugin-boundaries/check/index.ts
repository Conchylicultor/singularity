import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { dirname, join, relative, resolve, sep } from "path";
import { buildPluginTree } from "@plugins/plugin-meta/plugins/plugin-tree/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

const SKIPPED_PLUGINS: ReadonlyArray<string> = [];

// Sanctioned, TEMPORARY cross-plugin barrel re-exports for gradual migrations.
// Key: `${reexporting-plugin}/${runtime} -> ${source-specifier}`. Normally forbidden
// by the cross-plugin-reexport rule; each entry is a scoped, documented exception
// removed once all importers move to the source barrel directly.
const REEXPORT_EXCEPTIONS: ReadonlySet<string> = new Set([
  // Unified-fields migration (research/2026-06-07-global-unify-fieldtype-token.md, S1→S4):
  // config_v2/core temporarily re-exports the FieldType token from fields/core.
  // Remove with the shim in task 8.
  "config_v2/core -> @plugins/fields/core",
]);

// Framework-level files exempt from cross-plugin boundary checks (both the
// import grammar (R4) and the "default-import is registry-only" rule (R5)).
// Generated files (*.generated.ts) are exempt from R9 via a pattern check
// in the inline-import section below — they use dynamic import() by design.
//
// App.tsx and its test import the generated web plugin registry directly
// (re-exporting from the web-sdk barrel would pollute TSC's module graph
// in server/central tsconfigs via transitive import chains).
const FRAMEWORK_FILES: ReadonlySet<string> = new Set([
  "plugins/framework/plugins/web-core/web/App.tsx",
  "plugins/framework/plugins/web-core/web/__tests__/plugin-render.test.tsx",
]);

const VALID_RUNTIMES = new Set(["web", "server", "central", "core", "shared"]);

// Every top-level subdirectory inside a plugin must be one of these.
// Anything else (typos like "serrver/", ad-hoc folders like "utils/") is flagged.
const KNOWN_PLUGIN_DIRS = new Set([
  ...VALID_RUNTIMES,
  "plugins",
  "lint",
  "check",
  "facet",
  "scripts",
  "bin",
]);

const PUSH_BACK_HINT =
  "Do NOT work around these violations by editing `plugin-boundaries.ts`, expanding the skip list, " +
  "or adding ad-hoc exceptions. Plugin module boundaries are load-bearing infrastructure. " +
  "If you believe a rule is too strict or blocking a legitimate case, STOP and report it — " +
  "we'll iterate on the design together. Don't take initiative here.";

// ============================================================================
// Entry point
// ============================================================================

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

interface PluginDir {
  /** Relative path from `plugins/` root, e.g. "conversations/plugins/conversation-view". */
  relPath: string;
  /** Absolute path on disk. */
  absPath: string;
  /** Last path segment, e.g. "conversation-view". */
  name: string;
}

interface Violation {
  rule: string;
  file: string;
  message: string;
  fix?: string;
}

const check: Check = {
  id: "plugin-boundaries",
  description:
    "Plugin module boundaries: barrel purity, cross-plugin import grammar, DAG, package naming, directory structure",
  async run(): Promise<CheckResult> {
    const root = await getRoot();
    const pluginsRoot = join(root, "plugins");
    if (!existsSync(pluginsRoot)) return { ok: true };

    const tree = await buildPluginTree(pluginsRoot, { skipBarrelImport: true });
    const plugins: PluginDir[] = Array.from(tree.byDir.values()).map((node) => ({
      relPath: node.path,
      absPath: node.dir,
      name: node.name,
    }));
    const pluginSet = new Set(plugins.map((p) => p.relPath));
    const skippedSet = new Set(SKIPPED_PLUGINS);
    const violations: Violation[] = [];

    // R1: package.json naming
    for (const p of plugins) {
      if (skippedSet.has(p.relPath)) continue;
      checkPackageNaming(p, violations);
    }

    // R11: reject unrecognized top-level directories inside plugin folders
    for (const p of plugins) {
      if (skippedSet.has(p.relPath)) continue;
      checkUnknownDirs(p, plugins, violations);
    }

    // R3: barrel purity + existence for every runtime folder
    // web/server/core must have index.ts when the directory contains TS files.
    // central is optional (not all plugins target the central runtime).
    // shared/ is excluded — it uses relative imports, not barrels.
    for (const p of plugins) {
      if (skippedSet.has(p.relPath)) continue;
      for (const runtime of ["web", "server", "central", "core"] as const) {
        const runtimeDir = join(p.absPath, runtime);
        if (!existsSync(runtimeDir)) continue;
        const barrel = join(runtimeDir, "index.ts");
        if (!existsSync(barrel)) {
          if (runtime !== "central" && dirContainsTsFiles(runtimeDir)) {
            violations.push({
              rule: "barrel-required",
              file: `plugins/${p.relPath}/${runtime}/`,
              message: `missing \`index.ts\` barrel in \`${runtime}/\``,
              fix: `create \`plugins/${p.relPath}/${runtime}/index.ts\` — the barrel is the only legal cross-plugin entry point for this runtime`,
            });
          }
          continue;
        }
        checkBarrelPurity(barrel, relative(root, barrel), violations, p.relPath, runtime);
      }
    }

    // R4 + R5 + R6 + R7: walk source files, extract cross-plugin imports
    const sourceFiles = findSourceFiles(root);
    const edges = new Set<string>();

    for (const absFile of sourceFiles) {
      const relFile = relative(root, absFile);
      const sourcePlugin = pluginForPath(relFile, pluginSet);
      if (sourcePlugin && skippedSet.has(sourcePlugin)) continue;

      const src = safeRead(absFile);
      if (!src) continue;

      // R7: forbid direct workspace-name imports (`@singularity/plugin-*`).
      // Cross-plugin imports must go through `@plugins/...` so R4/R5/R6 can
      // see them; workspace-name imports resolve via node_modules symlinks
      // and silently bypass the boundary system.
      for (const wsPath of extractWorkspaceImports(src)) {
        violations.push({
          rule: "workspace-import",
          file: relFile,
          message: `direct workspace import \`${wsPath}\` bypasses the boundary system`,
          fix: `replace with the path-alias form \`@plugins/<path-to-plugin>/<runtime>\` (R4/R5/R6 only see those)`,
        });
      }

      // R8: forbid relative imports that escape the source plugin into a
      // different plugin's tree. Same motivation as R7 — relative paths
      // resolve outside the `@plugins/...` alias system, so R4/R5/R6 can't
      // see them, and a sub-plugin reaching `../../../../web/components/foo`
      // into its parent's internals silently bypasses every barrier.
      if (sourcePlugin) {
        for (const relImp of extractRelativeImports(src)) {
          const resolvedAbs = resolve(dirname(absFile), relImp);
          const resolvedRel = relative(root, resolvedAbs).split(sep).join("/");
          const targetPlugin = pluginForPath(resolvedRel, pluginSet);
          if (!targetPlugin || targetPlugin === sourcePlugin) continue;
          violations.push({
            rule: "relative-cross-plugin",
            file: relFile,
            message: `relative import \`${relImp}\` reaches into a different plugin (\`${targetPlugin}\`)`,
            fix: `cross-plugin imports must go through the barrel — replace with \`@plugins/${targetPlugin}/<runtime>\` and re-export the symbol from that plugin's \`index.ts\` if it isn't already public`,
          });
        }
      }

      // R12: shared/ is only importable from web/, server/, central/ within the
      // same plugin. Relative imports into shared/ from core/, lint/, check/ are
      // forbidden. (Cross-plugin shared/ imports are caught by R10 via the alias
      // form and by R8 via relative paths.)
      if (sourcePlugin) {
        const sourceRuntime = runtimeForPath(relFile, pluginSet);
        if (
          sourceRuntime &&
          sourceRuntime !== "web" &&
          sourceRuntime !== "server" &&
          sourceRuntime !== "central" &&
          sourceRuntime !== "shared"
        ) {
          const sharedPrefix = `plugins/${sourcePlugin}/shared`;
          for (const relImp of extractRelativeImports(src)) {
            const resolvedAbs = resolve(dirname(absFile), relImp);
            const resolvedRel = relative(root, resolvedAbs).split(sep).join("/");
            if (resolvedRel === sharedPrefix || resolvedRel.startsWith(sharedPrefix + "/")) {
              violations.push({
                rule: "shared-wrong-runtime",
                file: relFile,
                message: `\`${sourceRuntime}/\` cannot import from shared/ — only web/, server/, central/ may`,
                fix: `move the needed types/utils to \`core/\` if they must be shared with \`${sourceRuntime}/\``,
              });
            }
          }
        }
      }

      // R9: forbid inline import-type expressions targeting plugin barrels. They
      // bypass the static import scanner and make cross-plugin deps invisible to
      // the boundary system. Use a top-level `import type { X } from "…"` instead.
      // Framework files (plugin registries) are exempt — their dynamic imports
      // are the resilient-loading mechanism, not accidental boundary bypasses.
      if (!FRAMEWORK_FILES.has(relFile) && !relFile.endsWith(".generated.ts")) {
        for (const inlinePath of extractInlineImports(src)) {
          const resolved = resolveImport(inlinePath, pluginSet);
          if (!resolved) continue;
          if (sourcePlugin && sourcePlugin === resolved.pluginPath) continue;
          violations.push({
            rule: "inline-import",
            file: relFile,
            message: `inline \`import("${inlinePath}")\` type expression bypasses the boundary system`,
            fix: `replace with a top-level import type statement: \`import type { … } from "${inlinePath}"\``,
          });
        }
      }

      const imports = extractPluginImports(src);

      for (const imp of imports) {
        const resolved = resolveImport(imp.path, pluginSet);
        if (!resolved) continue;

        // Intra-plugin imports (source is the same plugin) are unrestricted,
        // EXCEPT: shared/ must use relative paths, not the @plugins alias.
        if (sourcePlugin === resolved.pluginPath) {
          if (resolved.suffixHead === "shared") {
            const sourceRuntime = runtimeForPath(relFile, pluginSet);
            if (
              sourceRuntime &&
              sourceRuntime !== "web" &&
              sourceRuntime !== "server" &&
              sourceRuntime !== "central" &&
              sourceRuntime !== "shared"
            ) {
              violations.push({
                rule: "shared-wrong-runtime",
                file: relFile,
                message: `\`${sourceRuntime}/\` cannot import from shared/ — only web/, server/, central/ may`,
                fix: `move the needed types/utils to \`core/\` if they must be shared with \`${sourceRuntime}/\``,
              });
            } else {
              violations.push({
                rule: "shared-use-relative",
                file: relFile,
                message: `use a relative import instead of \`${imp.path}\``,
                fix: `shared/ is plugin-private — import via relative path (e.g. \`../shared${resolved.tail ? "/" + resolved.tail : ""}\`) instead of the @plugins alias`,
              });
            }
          }
          continue;
        }

        const frameworkExempt = FRAMEWORK_FILES.has(relFile);

        // R10: cross-plugin shared/ imports are forbidden — shared/ is plugin-private.
        if (!frameworkExempt && resolved.suffixHead === "shared") {
          violations.push({
            rule: "cross-plugin-internal",
            file: relFile,
            message: `cross-plugin import from \`${imp.path}\` — shared/ is plugin-private`,
            fix: `if \`${resolved.pluginPath}\` needs a public API, create a \`core/\` barrel`,
          });
        }

        // R4: grammar — the import must end at `<runtime>`, nothing deeper.
        if (!frameworkExempt && (!VALID_RUNTIMES.has(resolved.suffixHead) || resolved.tail !== "")) {
          violations.push({
            rule: "grammar",
            file: relFile,
            message: `cross-plugin import into non-barrel path: \`${imp.path}\``,
            fix: `import from the plugin's barrel (\`@plugins/${resolved.pluginPath}/${resolved.suffixHead || "<runtime>"}\`) and re-export the needed symbol from the target plugin's \`index.ts\` if it isn't already public`,
          });
        }

        // R5: only framework files may pull a plugin's default export across boundaries.
        if (imp.kind === "default" && !frameworkExempt) {
          violations.push({
            rule: "default-import",
            file: relFile,
            message: `default import from \`${imp.path}\` is not allowed outside the plugin registries`,
            fix: `other plugins may only use named imports. The default export (PluginDefinition) is consumed exclusively by the generated registry files (e.g. \`web.generated.ts\`, \`server.generated.ts\`).`,
          });
        }

        // R6: track DAG edge (deduped), tagged with source file's runtime.
        // Files in tooling folders (lint/, check/) return null runtime — those
        // imports are skipped entirely rather than collapsed to "shared".
        if (sourcePlugin && sourcePlugin !== resolved.pluginPath) {
          const runtime = runtimeForPath(relFile, pluginSet);
          if (runtime !== null) {
            edges.add(`${sourcePlugin}\0${resolved.pluginPath}\0${runtime}`);
          }
        }
      }
    }

    // R6: detect cycles — run separately per runtime so web/server/central graphs
    // are never conflated (a cross-runtime path is not a real cycle).
    const edgeList = Array.from(edges).map((e) => {
      const parts = e.split("\0");
      return { from: parts[0]!, to: parts[1]!, runtime: parts[2] as "web" | "server" | "central" | "shared" };
    });
    // Core/shared code is reachable from every runtime.
    const crossRuntime = (e: { runtime: string }) =>
      e.runtime === "core" || e.runtime === "shared";
    const webEdges = edgeList.filter((e) => e.runtime === "web" || crossRuntime(e));
    const serverEdges = edgeList.filter((e) => e.runtime === "server" || crossRuntime(e));
    const centralEdges = edgeList.filter((e) => e.runtime === "central" || crossRuntime(e));
    const cycle = detectCycle(webEdges) ?? detectCycle(serverEdges) ?? detectCycle(centralEdges);
    if (cycle) {
      violations.push({
        rule: "cycle",
        file: "(cross-plugin graph)",
        message: `cross-plugin import cycle: ${cycle.join(" → ")}`,
        fix: "cycles signal misdrawn boundaries. Extract the shared concept into a separate library plugin (contributions: []) that both plugins import.",
      });
    }

    if (violations.length === 0) return { ok: true };

    return {
      ok: false,
      message: formatViolations(violations),
      hint: PUSH_BACK_HINT,
    };
  },
};

function runtimeForPath(
  relFile: string,
  pluginSet: Set<string>,
): "web" | "server" | "central" | "core" | "shared" | null {
  const norm = relFile.split(sep).join("/");
  const pluginPath = pluginForPath(relFile, pluginSet);
  if (!pluginPath) return null;
  const afterPlugin = norm.slice(`plugins/${pluginPath}/`.length);
  const segment = afterPlugin.split("/")[0];
  if (segment === "web") return "web";
  if (segment === "server") return "server";
  if (segment === "central") return "central";
  if (segment === "core") return "core";
  if (segment === "shared") return "shared";
  return null;
}

/** Return the relative plugin path that owns `relFile`, or null if the file lives outside `plugins/`. */
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

// ============================================================================
// Source-file discovery
// ============================================================================

const SOURCE_ROOTS = ["plugins", "plugins/framework/plugins/web-core/web"];
const IGNORED_DIRS = new Set(["node_modules", "dist", ".git"]);

function findSourceFiles(root: string): string[] {
  const out: string[] = [];
  for (const rootDir of SOURCE_ROOTS) {
    const abs = join(root, rootDir);
    if (!existsSync(abs)) continue;
    walkSourceFiles(abs, out);
  }
  return out;
}

function walkSourceFiles(dir: string, out: string[]) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (IGNORED_DIRS.has(e.name)) continue;
      walkSourceFiles(join(dir, e.name), out);
    } else if (e.isFile()) {
      if (e.name.endsWith(".ts") || e.name.endsWith(".tsx")) {
        out.push(join(dir, e.name));
      }
    }
  }
}

function safeRead(path: string): string | null {
  try {
    if (!statSync(path).isFile()) return null;
    return readFileSync(path, "utf-8");
  } catch {
    return null;
  }
}

// ============================================================================
// R1: package.json naming
// ============================================================================

/**
 * Expected `@singularity/plugin-<chain>` name for a plugin at `relPath`.
 * The chain joins every non-`plugins` segment with `-`, guaranteeing
 * uniqueness across the nested plugin tree (e.g. `plugins/tasks` and
 * `plugins/stats/plugins/tasks` map to `plugin-tasks` and `plugin-stats-tasks`
 * respectively).
 */
function expectedPackageName(relPath: string): string {
  const chain = relPath.split("/").filter((s) => s !== "plugins").join("-");
  return `@singularity/plugin-${chain}`;
}

function checkPackageNaming(p: PluginDir, violations: Violation[]) {
  const pkgPath = join(p.absPath, "package.json");
  const relPkg = `plugins/${p.relPath}/package.json`;
  const expected = expectedPackageName(p.relPath);
  if (!existsSync(pkgPath)) {
    violations.push({
      rule: "package",
      file: relPkg,
      message: "plugin is missing package.json",
      fix: `create \`${relPkg}\` with \`"name": "${expected}"\``,
    });
    return;
  }
  let data: { name?: unknown };
  try {
    data = JSON.parse(readFileSync(pkgPath, "utf-8"));
  } catch {
    violations.push({
      rule: "package",
      file: relPkg,
      message: "package.json is not valid JSON",
    });
    return;
  }
  if (data.name !== expected) {
    violations.push({
      rule: "package",
      file: relPkg,
      message: `package name is \`${String(data.name)}\`; expected \`${expected}\``,
      fix: `set \`"name": "${expected}"\` in ${relPkg}`,
    });
  }
}

// ============================================================================
// R11: unknown directories
// ============================================================================

function checkUnknownDirs(p: PluginDir, allPlugins: PluginDir[], violations: Violation[]) {
  // Child plugins live at `<plugin>/plugins/<child>` — their names appear as
  // direct subdirs of `<plugin>/plugins/`, not of `<plugin>/` itself, so they
  // won't trigger false positives here.
  const childPluginNames = new Set(
    allPlugins
      .filter((other) => {
        const prefix = `${p.relPath}/plugins/`;
        return other.relPath.startsWith(prefix) && !other.relPath.slice(prefix.length).includes("/");
      })
      .map((other) => other.name),
  );

  let entries;
  try {
    entries = readdirSync(p.absPath, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (KNOWN_PLUGIN_DIRS.has(e.name)) continue;
    if (e.name === "node_modules") continue;
    if (e.name.startsWith(".")) continue;
    if (childPluginNames.has(e.name)) continue;
    // Only flag directories that contain TS source files — non-code asset
    // directories (SQL migrations, shell scripts, etc.) are fine.
    if (!dirContainsTsFiles(join(p.absPath, e.name))) continue;
    violations.push({
      rule: "unknown-dir",
      file: `plugins/${p.relPath}/${e.name}/`,
      message: `unrecognized directory \`${e.name}/\` contains TypeScript files but is not a recognized zone`,
      fix: `plugin code must live in one of: ${[...KNOWN_PLUGIN_DIRS].join(", ")}. If this is a typo, rename it. If it's private shared code, use \`shared/\`.`,
    });
  }
}

function dirContainsTsFiles(dir: string): boolean {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const e of entries) {
    if (e.isFile() && (e.name.endsWith(".ts") || e.name.endsWith(".tsx"))) return true;
    if (e.isDirectory() && e.name !== "node_modules" && dirContainsTsFiles(join(dir, e.name))) return true;
  }
  return false;
}

// ============================================================================
// R3: barrel purity
// ============================================================================

/**
 * An `index.ts` may only contain:
 *   - import statements
 *   - named re-exports: `export { ... }`, `export { ... } from "..."`, `export type { ... }`
 *   - type/interface aliases: `type X = ...`, `interface X { ... }` (bare or exported)
 *   - exactly one `export default <expression>`
 *
 * `export * from "..."` / `export * as X from "..."` are disallowed because
 * docgen can't follow them to enumerate the public surface — every public
 * name must be written in the barrel. Wrap with a named re-export instead:
 * `import * as X from "./shared"; export { X };`.
 *
 * Any runtime declaration at the top level (`const`, `let`, `var`, `function`, `class`,
 * top-level `await`, control flow) is a violation — it should live in a sibling file
 * (conventionally `shared/`).
 */
function checkBarrelPurity(
  absPath: string,
  relPath: string,
  violations: Violation[],
  pluginPath: string,
  runtime: string,
) {
  const raw = safeRead(absPath);
  if (!raw) return;
  // stripComments (not stripCommentsAndStrings) so `from` specifiers survive
  // for the cross-plugin re-export check below.
  const stripped = stripComments(raw);
  const stmts = splitTopLevelStatements(stripped);
  for (const { text, line } of stmts) {
    const trimmed = text.trim();
    if (!trimmed) continue;
    if (isAllowedBarrelStatement(trimmed)) {
      if (trimmed.startsWith("export ")) {
        const specifier = extractFromSpecifier(trimmed);
        if (specifier?.startsWith("@plugins/")) {
          const rest = specifier.slice("@plugins/".length);
          const segments = rest.split("/");
          const lastSeg = segments[segments.length - 1]!;
          if (VALID_RUNTIMES.has(lastSeg)) {
            const specPluginPath = segments.slice(0, -1).join("/");
            const exceptionKey = `${pluginPath}/${runtime} -> ${specifier}`;
            if (specPluginPath !== pluginPath && !REEXPORT_EXCEPTIONS.has(exceptionKey)) {
              violations.push({
                rule: "cross-plugin-reexport",
                file: `${relPath}:${line}`,
                message: `barrel re-exports from another plugin: \`${specifier}\``,
                fix: `import the source barrel directly — never proxy another plugin's symbols through your own barrel. Consumers should \`import { … } from "${specifier}"\` themselves.`,
              });
            }
          }
        }
      }
      continue;
    }
    const head = trimmed.split(/\s+/).slice(0, 3).join(" ");
    if (isWildcardReexport(trimmed)) {
      violations.push({
        rule: "barrel-purity",
        file: `${relPath}:${line}`,
        message: `wildcard re-export in barrel: \`${head}${trimmed.length > head.length ? "…" : ""}\``,
        fix: "docgen can't follow `export *` to enumerate the public surface — every exported name must be written in the barrel. Replace with named re-exports (`export { A, B, type C } from \"./shared/foo\"`) or namespace: `import * as Foo from \"./shared/foo\"; export { Foo };`.",
      });
      continue;
    }
    violations.push({
      rule: "barrel-purity",
      file: `${relPath}:${line}`,
      message: `disallowed top-level statement in barrel: \`${head}${trimmed.length > head.length ? "…" : ""}\``,
      fix: "move this code into a sibling file (conventionally `shared/`). Barrels may only contain imports, re-exports, type aliases, and a single `export default`.",
    });
  }
}

function extractFromSpecifier(stmt: string): string | null {
  const m = stmt.match(/from\s+["']([^"']+)["']\s*$/);
  return m ? m[1]! : null;
}

function isWildcardReexport(s: string): boolean {
  if (!s.startsWith("export ")) return false;
  const rest = s.slice("export ".length).trimStart();
  if (rest.startsWith("*")) return true;
  if (rest.startsWith("type ")) {
    const afterType = rest.slice("type ".length).trimStart();
    if (afterType.startsWith("*")) return true;
  }
  return false;
}

function isAllowedBarrelStatement(s: string): boolean {
  if (s.startsWith("import ") || s.startsWith("import{")) return true;
  if (s.startsWith("export default")) return true;
  if (s.startsWith("type ") || s.startsWith("interface ")) return true;
  if (s.startsWith("export type ") || s.startsWith("export interface ")) return true;
  if (s.startsWith("export ")) {
    // Allowed: `export { ... }` (possibly with `from "..."`).
    // Disallowed: `export * from "..."` (docgen can't enumerate wildcard
    //             re-exports), `export const/let/var/function/class/async`.
    const rest = s.slice("export ".length).trimStart();
    if (rest.startsWith("{")) return true;
    return false;
  }
  return false;
}

// ============================================================================
// Tokenizer: strip comments + string/template contents, preserve structure
// ============================================================================

/**
 * Strip only comments (line and block), preserving string-literal contents
 * so module specifiers in imports survive. Maintains line positions.
 */
function stripComments(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i]!;
    const next = src[i + 1];
    if (c === "/" && next === "/") {
      while (i < n && src[i] !== "\n") {
        out += src[i] === "\n" ? "\n" : " ";
        i++;
      }
      continue;
    }
    if (c === "/" && next === "*") {
      out += "  ";
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) {
        out += src[i] === "\n" ? "\n" : " ";
        i++;
      }
      if (i < n) {
        out += "  ";
        i += 2;
      }
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      // Copy the string literal verbatim, skipping escapes.
      const quote = c;
      out += c;
      i++;
      while (i < n && src[i] !== quote) {
        if (src[i] === "\\" && i + 1 < n) {
          out += src[i]! + src[i + 1]!;
          i += 2;
          continue;
        }
        // Template interpolation: we don't recurse inside ${...}, just copy.
        out += src[i];
        i++;
      }
      if (i < n) {
        out += src[i];
        i++;
      }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

interface TopLevelStmt {
  text: string;
  line: number;
}

/**
 * Split `src` (already comment-/string-stripped) into top-level statements.
 * Statements are delimited by `;` or by newlines where the previous line is
 * statement-complete AND current depth is 0. For simplicity we treat each
 * semicolon-or-EOF segment at brace/paren/bracket depth 0 as one statement.
 */
function splitTopLevelStatements(src: string): TopLevelStmt[] {
  const out: TopLevelStmt[] = [];
  let depth = 0;
  let start = 0;
  let line = 1;
  let stmtLine = 1;
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (c === "\n") line++;
    if (c === "{" || c === "(" || c === "[") depth++;
    else if (c === "}" || c === ")" || c === "]") depth = Math.max(0, depth - 1);
    else if (c === ";" && depth === 0) {
      const text = src.slice(start, i);
      out.push({ text, line: stmtLine });
      start = i + 1;
      stmtLine = line;
    }
  }
  if (start < src.length) {
    const text = src.slice(start);
    if (text.trim()) out.push({ text, line: stmtLine });
  }
  // Also split on top-level newlines where the preceding statement form is
  // complete — specifically, `}` followed by a newline at depth 0 terminates
  // things like `interface X { ... }` and `export default { ... }`. Our
  // semicolon-based split already handles most real cases (TS code uses
  // semicolons or follows ASI conventions where barrels do); the added
  // robustness below catches brace-closed declarations lacking a trailing `;`.
  return expandBraceTerminated(out);
}

function expandBraceTerminated(stmts: TopLevelStmt[]): TopLevelStmt[] {
  const out: TopLevelStmt[] = [];
  for (const s of stmts) {
    const parts = splitByTopLevelBraceClose(s.text, s.line);
    for (const p of parts) out.push(p);
  }
  return out;
}

function splitByTopLevelBraceClose(text: string, baseLine: number): TopLevelStmt[] {
  const out: TopLevelStmt[] = [];
  let depth = 0;
  let start = 0;
  let line = baseLine;
  let stmtLine = baseLine;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === "\n") line++;
    if (c === "{" || c === "(" || c === "[") depth++;
    else if (c === "}" || c === ")" || c === "]") {
      depth = Math.max(0, depth - 1);
      if (depth === 0 && c === "}") {
        // Look ahead: if next non-whitespace char ends the segment with a newline
        // before any further syntactically meaningful token, split here.
        let j = i + 1;
        while (j < text.length && text[j] !== "\n" && /\s/.test(text[j]!)) j++;
        if (j >= text.length || text[j] === "\n") {
          out.push({ text: text.slice(start, i + 1), line: stmtLine });
          start = i + 1;
          stmtLine = line + (text[j] === "\n" ? 1 : 0);
          i = j;
          if (text[j] === "\n") line++;
        }
      }
    }
  }
  if (start < text.length) {
    const tail = text.slice(start);
    if (tail.trim()) out.push({ text: tail, line: stmtLine });
  }
  return out;
}

// ============================================================================
// Import extraction (R4, R5, R6)
// ============================================================================

type ImportKind = "default" | "named" | "namespace" | "side-effect";

interface Imp {
  path: string;
  kind: ImportKind;
}

/**
 * Extract every `import ... from "<mod>"` / `export ... from "<mod>"` statement.
 * Only `@plugins/...` modules are returned.
 *
 * `kind` is:
 *   - "default" if the statement has a default binding (`import Foo from`,
 *     `import Foo, { a } from`, `import type Foo from`).
 *   - "named" otherwise (named-only imports, re-exports).
 *   - "namespace" for `import * as X from` / `export * from`.
 *   - "side-effect" for bare `import "..."`.
 *
 * We strip comments (but keep string-literal contents intact so module
 * specifiers survive), then run line-anchored regexes. Misses only pathological
 * cases the linter in practice never encounters in this repo.
 */
/**
 * Extract module specifiers that target a sibling plugin via its bun-workspace
 * name (`@singularity/plugin-<chain>`). Such imports bypass the `@plugins/*`
 * path-alias system used by R4/R5/R6 — they resolve through `node_modules`
 * symlinks instead, which means the boundary rules can't see them. R7 catches
 * them and forces the alias form.
 */
function extractWorkspaceImports(rawSrc: string): string[] {
  const src = stripComments(rawSrc);
  const results: string[] = [];
  const withFromRe =
    /^[ \t]*(?:import|export)\s+[\s\S]*?\s+from\s+["'](@singularity\/plugin-[^"']+)["']/gm;
  const bareRe = /^[ \t]*import\s+["'](@singularity\/plugin-[^"']+)["']/gm;
  let m: RegExpExecArray | null;
  while ((m = withFromRe.exec(src))) results.push(m[1]!);
  while ((m = bareRe.exec(src))) results.push(m[1]!);
  return results;
}

/**
 * Extract every relative module specifier (`./...` or `../...`) from static
 * import/export statements. Used by R8 to flag relative imports that escape
 * the source plugin's tree. Skips dynamic `import()` and `require()`.
 */
function extractRelativeImports(rawSrc: string): string[] {
  const src = stripComments(rawSrc);
  const results: string[] = [];
  const withFromRe =
    /^[ \t]*(?:import|export)\s+[\s\S]*?\s+from\s+["'](\.\.?\/[^"']*)["']/gm;
  const bareRe = /^[ \t]*import\s+["'](\.\.?\/[^"']*)["']/gm;
  let m: RegExpExecArray | null;
  while ((m = withFromRe.exec(src))) results.push(m[1]!);
  while ((m = bareRe.exec(src))) results.push(m[1]!);
  return results;
}

/**
 * Extract every inline import-type expression that targets a plugin barrel.
 * These appear in type positions (e.g. `model?: import("plugins/…/shared").Bar`)
 * and are invisible to `extractPluginImports`, which only scans static
 * `import … from` statements. R9 flags them: use a top-level
 * `import type { Bar } from "…/shared"` instead.
 */
function extractInlineImports(rawSrc: string): string[] {
  const src = stripComments(rawSrc);
  const results: string[] = [];
  const re = /\bimport\s*\(\s*["'](@plugins\/[^"']+)["']\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) results.push(m[1]!);
  return results;
}

function extractPluginImports(rawSrc: string): Imp[] {
  const src = stripComments(rawSrc);
  const results: Imp[] = [];

  // `import ... from "..."` / `export ... from "..."`
  const withFromRe =
    /^[ \t]*(import|export)\s+([\s\S]*?)\s+from\s+["']([^"']+)["']/gm;
  let m: RegExpExecArray | null;
  while ((m = withFromRe.exec(src))) {
    const keyword = m[1]!;
    const body = m[2]!.trim();
    const modulePath = m[3]!;
    if (!modulePath.startsWith("@plugins/")) continue;
    if (!looksLikeImportOrReexport(keyword, body)) continue;
    results.push({ path: modulePath, kind: classifyKind(keyword, body) });
  }

  // Bare side-effect import: `import "..."`
  const bareRe = /^[ \t]*import\s+["']([^"']+)["']/gm;
  while ((m = bareRe.exec(src))) {
    const modulePath = m[1]!;
    if (!modulePath.startsWith("@plugins/")) continue;
    results.push({ path: modulePath, kind: "side-effect" });
  }

  return results;
}

function looksLikeImportOrReexport(keyword: string, body: string): boolean {
  if (keyword === "import") {
    // Valid bodies: "", "X", "X, { ... }", "{ ... }", "* as X", "type X", "type { ... }"
    if (body === "") return true;
    if (/^\*\s+as\s+\w+$/.test(body)) return true;
    if (/^type\s+/.test(body)) {
      const rest = body.replace(/^type\s+/, "");
      return /^\w+$/.test(rest) || /^\{[^}]*\}$/.test(rest) || /^\*\s+as\s+\w+$/.test(rest);
    }
    if (/^\w+$/.test(body)) return true;
    if (/^\{[\s\S]*\}$/.test(body)) return true;
    if (/^\w+\s*,\s*\{[\s\S]*\}$/.test(body)) return true;
    return false;
  }
  if (keyword === "export") {
    // Valid re-exports: "{ ... }", "* as X", "*", "type { ... }", "type * as X"
    if (/^\{[\s\S]*\}$/.test(body)) return true;
    if (/^\*(\s+as\s+\w+)?$/.test(body)) return true;
    if (/^type\s+/.test(body)) {
      const rest = body.replace(/^type\s+/, "");
      return /^\{[\s\S]*\}$/.test(rest) || /^\*(\s+as\s+\w+)?$/.test(rest);
    }
    return false;
  }
  return false;
}

function classifyKind(keyword: string, body: string): ImportKind {
  if (keyword === "export") return "named"; // re-exports never bring in a default alias
  if (body === "") return "side-effect";
  if (/^\*\s+as\s+\w+$/.test(body)) return "namespace";
  if (/^type\s+\*\s+as\s+\w+$/.test(body)) return "namespace";
  // Strip leading `type ` marker (type-only import)
  const stripped = body.replace(/^type\s+/, "").trim();
  // Default: starts with a bare identifier (not `{`)
  if (/^\w+(\s*,\s*\{[\s\S]*\})?$/.test(stripped)) return "default";
  return "named";
}

interface ResolvedImport {
  pluginPath: string;
  /** First path segment after the plugin path, e.g. "web" / "server" / "shared". */
  suffixHead: string;
  /** Remaining path after the suffixHead. Empty means the import targets the barrel. */
  tail: string;
}

function resolveImport(importPath: string, pluginSet: Set<string>): ResolvedImport | null {
  if (!importPath.startsWith("@plugins/")) return null;
  const rest = importPath.slice("@plugins/".length);
  const parts = rest.split("/");
  // Longest matching plugin path prefix wins (so a nested sub-plugin resolves
  // to itself rather than its parent).
  let best = "";
  for (let i = 1; i <= parts.length; i++) {
    const candidate = parts.slice(0, i).join("/");
    if (pluginSet.has(candidate)) best = candidate;
  }
  if (!best) return null;
  const remainder = rest.slice(best.length).replace(/^\//, "");
  if (!remainder) {
    // Import like `@plugins/foo` with no runtime — treat as invalid suffix.
    return { pluginPath: best, suffixHead: "", tail: "" };
  }
  const remParts = remainder.split("/");
  return {
    pluginPath: best,
    suffixHead: remParts[0]!,
    tail: remParts.slice(1).join("/"),
  };
}

// ============================================================================
// R6: cycle detection
// ============================================================================

function detectCycle(edges: { from: string; to: string }[]): string[] | null {
  const adj = new Map<string, Set<string>>();
  for (const { from, to } of edges) {
    if (!adj.has(from)) adj.set(from, new Set());
    adj.get(from)!.add(to);
  }
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  const parent = new Map<string, string>();
  const nodes = new Set<string>();
  for (const { from, to } of edges) {
    nodes.add(from);
    nodes.add(to);
  }

  for (const node of nodes) {
    if (color.get(node) !== undefined) continue;
    const stack: Array<{ node: string; iter: Iterator<string> }> = [
      { node, iter: (adj.get(node) ?? new Set<string>()).values() },
    ];
    color.set(node, GRAY);
    while (stack.length) {
      const top = stack[stack.length - 1]!;
      const step = top.iter.next();
      if (step.done) {
        color.set(top.node, BLACK);
        stack.pop();
        continue;
      }
      const nxt = step.value;
      const col = color.get(nxt) ?? WHITE;
      if (col === GRAY) {
        // Reconstruct the cycle: walk parents from top.node back to nxt, then append nxt.
        const path: string[] = [top.node];
        let cur = top.node;
        while (cur !== nxt) {
          const par = parent.get(cur);
          if (par === undefined) break;
          path.push(par);
          cur = par;
        }
        path.push(nxt);
        path.reverse();
        return path;
      }
      if (col === WHITE) {
        color.set(nxt, GRAY);
        parent.set(nxt, top.node);
        stack.push({ node: nxt, iter: (adj.get(nxt) ?? new Set<string>()).values() });
      }
    }
  }
  return null;
}

// ============================================================================
// Output formatting
// ============================================================================

const MAX_REPORTED = 15;

function formatViolations(vs: Violation[]): string {
  const grouped = new Map<string, Violation[]>();
  for (const v of vs) {
    if (!grouped.has(v.rule)) grouped.set(v.rule, []);
    grouped.get(v.rule)!.push(v);
  }
  const lines: string[] = [];
  lines.push(`${vs.length} plugin-boundary violation(s):`);
  for (const [rule, list] of grouped) {
    lines.push("");
    lines.push(`  [${rule}] ${list.length} violation(s)`);
    const shown = list.slice(0, MAX_REPORTED);
    for (const v of shown) {
      lines.push(`    ${v.file}: ${v.message}`);
      if (v.fix) lines.push(`      → ${v.fix}`);
    }
    if (list.length > shown.length) {
      lines.push(`    … and ${list.length - shown.length} more`);
    }
  }
  return lines.join("\n");
}

export default check;

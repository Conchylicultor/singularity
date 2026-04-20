import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { basename, join, relative, sep } from "path";
import type { Check, CheckResult } from "./types";

// ============================================================================
// Grandfather list
// ============================================================================
//
// Plugins currently exempt from enforcement. Violations inside these plugins
// are skipped so the check can land without requiring simultaneous migration.
// Cross-plugin imports *into* a skipped plugin are still checked on the
// importing side — only the owning plugin's internals are free.
//
// Paths are relative to `plugins/`. Remove entries as plugins are brought into
// compliance. Empty list = full enforcement.
const SKIPPED_PLUGINS: ReadonlyArray<string> = [
  // Known architectural cycle: conversations ↔ tasks (server-side, mutual FK deps).
  // conversations/server/internal/tables.ts needs _attempts from tasks, and
  // tasks/server/internal/schema.ts needs _conversations from conversations.
  // Both must use direct leaf table imports (not barrels) to avoid runtime
  // circular initialization errors. Fixing requires design discussion.
  "conversations",
  "tasks",
  // Known cross-runtime false-positive cycle:
  // conversations/plugins/conversation-view → conversations → tasks → conversation-view
  // (web and server are separate module graphs; no actual runtime cycle exists)
  // Needs design discussion before breaking architecturally.
  "conversations/plugins/conversation-view",
  "conversations/plugins/conversation-view/plugins/code",
  "conversations/plugins/conversation-view/plugins/code/plugins/file-pane",
];

// Framework-level files exempt from cross-plugin boundary checks (both the
// import grammar (R4) and the "default-import is registry-only" rule (R5)).
//
// Principled exemptions:
//   - web/src/plugins.ts / server/src/plugins.ts: plugin registries. Their
//     entire purpose is to import every PluginDefinition (default exports).
//   - server/src/db/schema.ts: drizzle aggregator. Intentionally `export *`s
//     plugin internal schemas so `drizzle({ schema })` knows every table.
//
const FRAMEWORK_FILES: ReadonlySet<string> = new Set([
  "web/src/plugins.ts",
  "server/src/plugins.ts",
  "server/src/db/schema.ts",
  "server/src/index.ts",
]);

const VALID_RUNTIMES = new Set(["web", "server", "shared"]);

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

export const pluginBoundaries: Check = {
  id: "plugin-boundaries",
  description:
    "Plugin module boundaries: barrel purity, cross-plugin import grammar, DAG, package naming",
  async run(): Promise<CheckResult> {
    const root = await getRoot();
    const pluginsRoot = join(root, "plugins");
    if (!existsSync(pluginsRoot)) return { ok: true };

    const plugins = discoverPlugins(pluginsRoot);
    const pluginSet = new Set(plugins.map((p) => p.relPath));
    const skippedSet = new Set(SKIPPED_PLUGINS);
    const violations: Violation[] = [];

    // R1: package.json naming
    for (const p of plugins) {
      if (skippedSet.has(p.relPath)) continue;
      checkPackageNaming(p, violations);
    }

    // R3: barrel purity for every index.ts under each plugin's runtime folders
    for (const p of plugins) {
      if (skippedSet.has(p.relPath)) continue;
      for (const runtime of ["web", "server", "shared"] as const) {
        const barrel = join(p.absPath, runtime, "index.ts");
        if (!existsSync(barrel)) continue;
        checkBarrelPurity(barrel, relative(root, barrel), violations);
      }
    }

    // R4 + R5 + R6: walk source files, extract cross-plugin imports
    const sourceFiles = findSourceFiles(root);
    const edges = new Set<string>();

    for (const absFile of sourceFiles) {
      const relFile = relative(root, absFile);
      const sourcePlugin = pluginForPath(relFile, pluginSet);
      if (sourcePlugin && skippedSet.has(sourcePlugin)) continue;

      const src = safeRead(absFile);
      if (!src) continue;
      const imports = extractPluginImports(src);

      for (const imp of imports) {
        const resolved = resolveImport(imp.path, pluginSet);
        if (!resolved) continue;

        // Intra-plugin imports (source is the same plugin) are unrestricted.
        if (sourcePlugin === resolved.pluginPath) continue;

        const frameworkExempt = FRAMEWORK_FILES.has(relFile);

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
            fix: `other plugins may only use named imports. The default export (PluginDefinition) is consumed exclusively by \`web/src/plugins.ts\` and \`server/src/plugins.ts\`.`,
          });
        }

        // R6: track DAG edge (deduped).
        if (sourcePlugin && sourcePlugin !== resolved.pluginPath) {
          edges.add(`${sourcePlugin}\0${resolved.pluginPath}`);
        }
      }
    }

    // R6: detect cycles
    const edgeList = Array.from(edges).map((e) => {
      const [from, to] = e.split("\0");
      return { from: from!, to: to! };
    });
    const cycle = detectCycle(edgeList);
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

// ============================================================================
// Plugin discovery
// ============================================================================

function discoverPlugins(pluginsRoot: string): PluginDir[] {
  const out: PluginDir[] = [];
  function walk(dir: string, depth: number) {
    if (depth > 10) return;
    const hasWeb = existsSync(join(dir, "web", "index.ts"));
    const hasServer = existsSync(join(dir, "server", "index.ts"));
    if ((hasWeb || hasServer) && dir !== pluginsRoot) {
      const relPath = relative(pluginsRoot, dir).split(sep).join("/");
      out.push({ relPath, absPath: dir, name: basename(dir) });
    }
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

const SOURCE_ROOTS = ["plugins", "web/src", "server/src"];
const IGNORED_DIRS = new Set(["node_modules", "dist", "build", ".git"]);

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

function checkPackageNaming(p: PluginDir, violations: Violation[]) {
  const pkgPath = join(p.absPath, "package.json");
  const relPkg = `plugins/${p.relPath}/package.json`;
  if (!existsSync(pkgPath)) {
    violations.push({
      rule: "package",
      file: relPkg,
      message: "plugin is missing package.json",
      fix: `create \`${relPkg}\` with \`"name": "@singularity/plugin-${p.name}"\``,
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
  const expected = `@singularity/plugin-${p.name}`;
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
 * `import * as X from "./internal"; export { X };`.
 *
 * Any runtime declaration at the top level (`const`, `let`, `var`, `function`, `class`,
 * top-level `await`, control flow) is a violation — it should live in a sibling file
 * (conventionally `internal/`).
 */
function checkBarrelPurity(absPath: string, relPath: string, violations: Violation[]) {
  const raw = safeRead(absPath);
  if (!raw) return;
  const stripped = stripCommentsAndStrings(raw);
  const stmts = splitTopLevelStatements(stripped);
  for (const { text, line } of stmts) {
    const trimmed = text.trim();
    if (!trimmed) continue;
    if (isAllowedBarrelStatement(trimmed)) continue;
    const head = trimmed.split(/\s+/).slice(0, 3).join(" ");
    if (isWildcardReexport(trimmed)) {
      violations.push({
        rule: "barrel-purity",
        file: `${relPath}:${line}`,
        message: `wildcard re-export in barrel: \`${head}${trimmed.length > head.length ? "…" : ""}\``,
        fix: "docgen can't follow `export *` to enumerate the public surface — every exported name must be written in the barrel. Replace with named re-exports (`export { A, B, type C } from \"./internal/foo\"`) or namespace: `import * as Foo from \"./internal/foo\"; export { Foo };`.",
      });
      continue;
    }
    violations.push({
      rule: "barrel-purity",
      file: `${relPath}:${line}`,
      message: `disallowed top-level statement in barrel: \`${head}${trimmed.length > head.length ? "…" : ""}\``,
      fix: "move this code into a sibling file (conventionally `internal/`). Barrels may only contain imports, re-exports, type aliases, and a single `export default`.",
    });
  }
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

/** Replace comment bodies and string-literal contents with spaces so positions stay aligned. */
function stripCommentsAndStrings(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i]!;
    const next = src[i + 1];
    // Line comment
    if (c === "/" && next === "/") {
      while (i < n && src[i] !== "\n") {
        out += src[i] === "\n" ? "\n" : " ";
        i++;
      }
      continue;
    }
    // Block comment
    if (c === "/" && next === "*") {
      out += "  ";
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) {
        out += src[i] === "\n" ? "\n" : " ";
        i++;
      }
      out += "  ";
      i += 2;
      continue;
    }
    // String / template literal
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      out += c;
      i++;
      while (i < n && src[i] !== quote) {
        if (src[i] === "\\" && i + 1 < n) {
          out += "  ";
          i += 2;
          continue;
        }
        if (src[i] === "\n") out += "\n";
        else out += " ";
        // Template literal interpolation: `${ ... }` — scan nested braces
        if (quote === "`" && src[i] === "$" && src[i + 1] === "{") {
          // Preserve the interpolation opener/closer so brace depth tracking works.
          // But since we're stripping content, just walk through nested braces.
          out += "  ";
          i += 2;
          let depth = 1;
          while (i < n && depth > 0) {
            const ch = src[i]!;
            if (ch === "{") depth++;
            else if (ch === "}") depth--;
            out += ch === "\n" ? "\n" : " ";
            i++;
          }
          continue;
        }
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

import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { basename, dirname, join, relative, resolve, sep } from "path";
import type { Check, CheckResult } from "./types";

interface Violation {
  rule: string;
  file: string;
  message: string;
  fix?: string;
}

const PUSH_BACK_HINT =
  "Do NOT work around these violations by editing `package-boundaries.ts` or adding exceptions. " +
  "Package boundaries are load-bearing infrastructure. If you believe a rule is too strict, STOP and report it.";

// Allowlist: only these internal prefixes are legal inside packages/.
// Everything else that looks like an internal alias or workspace import is rejected.
const ALLOWED_INTERNAL_PREFIXES = ["@packages/"];

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

export const packageBoundaries: Check = {
  id: "package-boundaries",
  description:
    "packages/ libraries must not import from plugins, server, web, central, cli, or plugin-core",
  async run(): Promise<CheckResult> {
    const root = await getRoot();
    const packagesRoot = join(root, "packages");
    if (!existsSync(packagesRoot)) return { ok: true };

    const packages = discoverPackageDirs(packagesRoot);
    if (packages.length === 0) return { ok: true };

    const violations: Violation[] = [];

    for (const pkgDir of packages) {
      const files = walkSourceFiles(pkgDir);
      for (const absFile of files) {
        const src = safeRead(absFile);
        if (!src) continue;
        const relFile = relative(root, absFile);
        checkFile(relFile, absFile, src, root, violations);
      }
    }

    if (violations.length === 0) return { ok: true };
    return {
      ok: false,
      message: formatViolations(violations),
      hint: PUSH_BACK_HINT,
    };
  },
};

function discoverPackageDirs(packagesRoot: string): string[] {
  let entries;
  try {
    entries = readdirSync(packagesRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isDirectory() && e.name !== "node_modules")
    .map((e) => join(packagesRoot, e.name));
}

function walkSourceFiles(dir: string): string[] {
  const out: string[] = [];
  const IGNORED = new Set(["node_modules", "dist", "build", ".git"]);
  function walk(d: string) {
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (IGNORED.has(e.name)) continue;
        walk(join(d, e.name));
      } else if (e.isFile() && (e.name.endsWith(".ts") || e.name.endsWith(".tsx"))) {
        out.push(join(d, e.name));
      }
    }
  }
  walk(dir);
  return out;
}

function safeRead(path: string): string | null {
  try {
    if (!statSync(path).isFile()) return null;
    return readFileSync(path, "utf-8");
  } catch {
    return null;
  }
}

function isExternalDep(spec: string): boolean {
  // Not a relative path and not an internal @-alias
  return !spec.startsWith(".") && !spec.startsWith("@") && !spec.startsWith("/");
}

function isScopedExternalDep(spec: string): boolean {
  // Scoped npm packages that aren't internal (@singularity/, @packages/, @plugins/, etc.)
  if (!spec.startsWith("@")) return false;
  const scope = spec.split("/")[0]!;
  return scope !== "@singularity" && scope !== "@plugins" && scope !== "@packages" &&
    scope !== "@core" && scope !== "@server" && scope !== "@central";
}

function isAllowedImport(spec: string, absFile: string, root: string): boolean {
  // Allowed: relative imports that stay within packages/
  if (spec.startsWith(".")) {
    const resolved = resolve(dirname(absFile), spec);
    const resolvedRel = relative(root, resolved).split(sep).join("/");
    return resolvedRel.startsWith("packages/");
  }

  // Allowed: explicitly allowlisted internal prefixes
  if (ALLOWED_INTERNAL_PREFIXES.some((prefix) => spec.startsWith(prefix))) {
    return true;
  }

  // Allowed: external npm packages (bare specifiers and non-internal scoped packages)
  if (isExternalDep(spec) || isScopedExternalDep(spec)) {
    return true;
  }

  return false;
}

function checkFile(
  relFile: string,
  absFile: string,
  src: string,
  root: string,
  violations: Violation[],
) {
  const stripped = stripComments(src);
  const specifiers = extractImportSpecifiers(stripped);

  for (const spec of specifiers) {
    if (isAllowedImport(spec, absFile, root)) continue;

    // Relative escape
    if (spec.startsWith(".")) {
      const resolved = resolve(dirname(absFile), spec);
      const resolvedRel = relative(root, resolved).split(sep).join("/");
      violations.push({
        rule: "package-boundary",
        file: relFile,
        message: `relative import \`${spec}\` escapes into \`${resolvedRel.split("/")[0]}/\``,
        fix: "packages cannot reach outside packages/ via relative paths",
      });
    } else {
      violations.push({
        rule: "package-boundary",
        file: relFile,
        message: `import \`${spec}\` is not allowed — packages may only import from other packages (\`@packages/*\`) and external deps`,
        fix: "move the needed code into a package or accept it as a parameter",
      });
    }
  }
}

/**
 * Strip comments (line and block), preserving string-literal contents
 * so module specifiers in imports survive.
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
        out += " ";
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
      const quote = c;
      out += c;
      i++;
      while (i < n && src[i] !== quote) {
        if (src[i] === "\\" && i + 1 < n) {
          out += src[i]! + src[i + 1]!;
          i += 2;
          continue;
        }
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

/**
 * Extract module specifiers from static import/export statements and dynamic import() calls.
 */
function extractImportSpecifiers(src: string): string[] {
  const specifiers: string[] = [];

  // Static: import ... from "specifier" / export ... from "specifier"
  const staticRe = /(?:import|export)\s+(?:[\s\S]*?)\s+from\s+["']([^"']+)["']/g;
  let m;
  while ((m = staticRe.exec(src)) !== null) {
    specifiers.push(m[1]!);
  }

  // Side-effect imports: import "specifier"
  const sideEffectRe = /import\s+["']([^"']+)["']/g;
  while ((m = sideEffectRe.exec(src)) !== null) {
    specifiers.push(m[1]!);
  }

  // Dynamic: import("specifier")
  const dynamicRe = /import\(\s*["']([^"']+)["']\s*\)/g;
  while ((m = dynamicRe.exec(src)) !== null) {
    specifiers.push(m[1]!);
  }

  return specifiers;
}

function formatViolations(violations: Violation[]): string {
  const byRule = new Map<string, Violation[]>();
  for (const v of violations) {
    const list = byRule.get(v.rule) ?? [];
    list.push(v);
    byRule.set(v.rule, list);
  }

  const lines: string[] = [];
  for (const [rule, vs] of byRule) {
    lines.push(`\n  [${rule}] (${vs.length} violation${vs.length > 1 ? "s" : ""}):`);
    const shown = vs.slice(0, 15);
    for (const v of shown) {
      lines.push(`    ${v.file}: ${v.message}`);
      if (v.fix) lines.push(`      → ${v.fix}`);
    }
    if (vs.length > 15) {
      lines.push(`    … and ${vs.length - 15} more`);
    }
  }
  return lines.join("\n");
}

import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join, relative, sep } from "path";
import { buildPluginTree } from "@plugins/plugin-meta/plugins/plugin-tree/core";
import { findImports } from "@plugins/plugin-meta/plugins/parse-utils/core";
import type { Check, CheckResult } from "@plugins/framework/plugins/tooling/core";
import type { BoundaryConfig } from "./types";
import { buildZoneMap } from "./resolve";
import { checkRuntime, detectCycle, evaluateEdges, isRuntimeException } from "./evaluate";

const PUSH_BACK_HINT =
  "Do NOT work around boundary violations by editing the boundary check or config " +
  "without understanding the architectural intent. If a rule blocks a legitimate case, " +
  "STOP and report it — we'll iterate on the design together.";

const SOURCE_ROOTS = ["plugins", "web/src", "cli/src"];
const IGNORED_DIRS = new Set(["node_modules", "dist", "build", ".git"]);

interface Violation {
  file: string;
  message: string;
  fix?: string;
}

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

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
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code == null) throw err;
    return;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (IGNORED_DIRS.has(e.name)) continue;
      walkSourceFiles(join(dir, e.name), out);
    } else if (e.isFile() && (e.name.endsWith(".ts") || e.name.endsWith(".tsx"))) {
      out.push(join(dir, e.name));
    }
  }
}

function safeRead(path: string): string | null {
  try {
    if (!statSync(path).isFile()) return null;
    return readFileSync(path, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code == null) throw err;
    return null;
  }
}

// Alias specifiers the zone map can resolve; every other specifier (relative,
// bare npm) resolves to null downstream, so filtering here is just an early cut.
const ZONE_SPECIFIER_RE = /^@(?:plugins|core|server|central)(?:\/|$)/;

function extractCrossZoneImports(rawSrc: string): string[] {
  // `findImports` masks comments/regex AND string interiors, then reads each
  // specifier back by offset — so a `from "@plugins/…"` written inside a string
  // or template literal (test fixture, docs snippet) is never mistaken for a
  // real import, while genuine imports (including in test files) are still caught.
  return findImports(rawSrc)
    .map((i) => i.specifier)
    .filter((s) => ZONE_SPECIFIER_RE.test(s));
}

const MAX_REPORTED = 15;

function formatViolations(vs: Violation[]): string {
  const lines: string[] = [];
  lines.push(`${vs.length} boundary-rules violation(s):`);
  const shown = vs.slice(0, MAX_REPORTED);
  for (const v of shown) {
    lines.push(`  ${v.file}: ${v.message}`);
    if (v.fix) lines.push(`    → ${v.fix}`);
  }
  if (vs.length > shown.length) {
    lines.push(`  … and ${vs.length - shown.length} more`);
  }
  return lines.join("\n");
}

function parseRuntimeException(expr: string): { source: string; target: string } {
  const parts = expr.split("->").map((s) => s.trim());
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`invalid runtime exception: "${expr}" — expected "source.runtime -> target.runtime"`);
  }
  return { source: parts[0], target: parts[1] };
}

export function createBoundaryCheck(config: BoundaryConfig): Check {
  return {
    id: "boundary-rules",
    description:
      "Zone-DAG boundary rules: runtime isolation + zone-level default-deny import restrictions",
    async run(): Promise<CheckResult> {
      const root = await getRoot();
      const pluginsRoot = join(root, "plugins");

      const pluginTree = existsSync(pluginsRoot) ? await buildPluginTree(pluginsRoot, { skipBarrelImport: true }) : null;
      const zoneMap = buildZoneMap(
        root,
        config.zones,
        pluginTree,
        new Set(Object.keys(config.runtimes)),
      );

      const rtExceptions = new Set<string>();
      for (const expr of config.runtimeExceptions ?? []) {
        const { source, target } = parseRuntimeException(expr);
        rtExceptions.add(`${source}\0${target}`);
      }

      const excludeSet = new Set(config.exclude ?? []);
      const violations: Violation[] = [];
      const realizedEdges = new Set<string>();

      // The checker treats runtime names as opaque strings parsed from file paths
      // and specifiers, so read the (now key-typed) boundary map through the same
      // widened view that checkRuntime() uses for its lookups.
      const runtimeMap: Record<string, string[]> = config.runtimes;

      const sourceFiles = findSourceFiles(root);

      for (const absFile of sourceFiles) {
        const relFile = relative(root, absFile).split(sep).join("/");

        if (excludeSet.has(relFile)) continue;

        const source = zoneMap.resolveFile(relFile);
        if (!source) continue;

        const src = safeRead(absFile);
        if (!src) continue;

        const imports = extractCrossZoneImports(src);

        for (const specifier of imports) {
          const target = zoneMap.resolveImport(specifier);
          if (!target) continue;

          if (source.zone === target.zone) continue;

          const rtExempt = isRuntimeException(
            rtExceptions,
            source.zone,
            source.runtime,
            target.zone,
            target.runtime,
          );

          if (!rtExempt && !checkRuntime(config.runtimes, source.runtime, target.runtime)) {
            const srcLabel = source.runtime ? `${source.zone}.${source.runtime}` : source.zone;
            const tgtLabel = target.runtime ? `${target.zone}.${target.runtime}` : target.zone;
            violations.push({
              file: relFile,
              message: `runtime isolation: ${source.runtime} cannot import ${target.runtime} (${srcLabel} → ${tgtLabel}, import "${specifier}")`,
              fix: `${source.runtime} can only import from [${(runtimeMap[source.runtime!] ?? []).join(", ")}]. If this is legitimate, add a runtimeException in boundary.config.ts`,
            });
            continue;
          }

          const result = evaluateEdges(config.edges, source.zone, target.zone);

          if (result === "allow") {
            const srcKey = source.runtime ? `${source.zone}.${source.runtime}` : source.zone;
            const tgtKey = target.runtime ? `${target.zone}.${target.runtime}` : target.zone;
            realizedEdges.add(`${srcKey}\0${tgtKey}`);
            continue;
          }

          const reason =
            result === "deny" ? "denied by boundary rule" : "no allow rule (default-deny)";

          violations.push({
            file: relFile,
            message: `${reason}: ${source.zone} → ${target.zone} (import "${specifier}")`,
            fix:
              result === "default-deny"
                ? `add an allow edge in boundary.config.ts: allow("${source.zone} -> ${target.zone}")`
                : `a deny rule blocks this import. If legitimate, add a specific allow above the deny`,
          });
        }
      }

      const edgeList = Array.from(realizedEdges).map((e) => {
        const [from, to] = e.split("\0");
        return { from: from!, to: to! };
      });
      const cycle = detectCycle(edgeList);
      if (cycle) {
        violations.push({
          file: "(cross-zone graph)",
          message: `import cycle: ${cycle.join(" → ")}`,
          fix: "cycles signal misdrawn boundaries. Extract the shared concept into a separate plugin that both zones import.",
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
}

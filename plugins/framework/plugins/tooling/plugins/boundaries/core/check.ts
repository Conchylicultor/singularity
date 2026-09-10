import { existsSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { buildPluginTree } from "@plugins/plugin-meta/plugins/plugin-tree/core";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";
import { findImports } from "@plugins/plugin-meta/plugins/parse-utils/core";
import { listRepoFiles } from "@plugins/framework/plugins/tooling/plugins/checks/core";
import type {
  Check,
  CheckResult,
} from "@plugins/framework/plugins/tooling/core";
import type { BoundaryConfig } from "./types";
import { buildZoneMap } from "./resolve";
import {
  checkRuntime,
  detectCycle,
  evaluateEdges,
  isRuntimeException,
} from "./evaluate";

const PUSH_BACK_HINT =
  "Do NOT work around boundary violations by editing the boundary check or config " +
  "without understanding the architectural intent. If a rule blocks a legitimate case, " +
  "STOP and report it — we'll iterate on the design together.";

interface Violation {
  file: string;
  message: string;
  fix?: string;
}

// The candidate set is every `.ts`/`.tsx` git lists — tracked + untracked-not-
// ignored, the universe the check cache key is built from — and the zone config
// alone decides which of them are in scope (`zoneMap.resolveFile`). Neither half
// has a second statement here. This used to walk `SOURCE_ROOTS` pruning an
// `IGNORED_DIRS` deny-list, which was wrong both ways: its `build` entry hid
// three tracked plugins named `build` from every rule, while it still scanned
// gitignored content (`.cache/`, `dist.*`) no commit contains. See
// research/2026-09-10-tooling-boundary-rules-file-enumeration-from-git.md.
async function listCandidateFiles(root: string): Promise<string[]> {
  return (await listRepoFiles(root)).filter(
    (p) => p.endsWith(".ts") || p.endsWith(".tsx"),
  );
}

function safeRead(path: string): string | null {
  try {
    if (!statSync(path).isFile()) return null;
    return readFileSync(path, "utf-8");
  } catch (err) {
    // Every path is git-listed and present at listing time, so a read failure
    // is a race with a delete (or a dangling symlink). Anything else is a real
    // fault and stays loud.
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT" && code !== "EACCES" && code !== "ENOTDIR") throw err;
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

function parseRuntimeException(expr: string): {
  source: string;
  target: string;
} {
  const parts = expr.split("->").map((s) => s.trim());
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(
      `invalid runtime exception: "${expr}" — expected "source.runtime -> target.runtime"`,
    );
  }
  return { source: parts[0], target: parts[1] };
}

export function createBoundaryCheck(config: BoundaryConfig): Check {
  return {
    id: "boundary-rules",
    description:
      "Zone-DAG boundary rules: runtime isolation + zone-level default-deny import restrictions",
    async run(): Promise<CheckResult> {
      const root = await getWorktreeRoot();
      const pluginsRoot = join(root, "plugins");

      const pluginTree = existsSync(pluginsRoot)
        ? await buildPluginTree(pluginsRoot, { skipBarrelImport: true })
        : null;
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

      for (const relFile of await listCandidateFiles(root)) {
        if (excludeSet.has(relFile)) continue;

        const source = zoneMap.resolveFile(relFile);
        if (!source) continue;

        const src = safeRead(join(root, relFile));
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

          if (
            !rtExempt &&
            !checkRuntime(config.runtimes, source.runtime, target.runtime)
          ) {
            const srcLabel = source.runtime
              ? `${source.zone}.${source.runtime}`
              : source.zone;
            const tgtLabel = target.runtime
              ? `${target.zone}.${target.runtime}`
              : target.zone;
            violations.push({
              file: relFile,
              message: `runtime isolation: ${source.runtime} cannot import ${target.runtime} (${srcLabel} → ${tgtLabel}, import "${specifier}")`,
              fix: `${source.runtime} can only import from [${(runtimeMap[source.runtime!] ?? []).join(", ")}]. If this is legitimate, add a runtimeException in boundary.config.ts`,
            });
            continue;
          }

          const result = evaluateEdges(config.edges, source.zone, target.zone);

          if (result === "allow") {
            const srcKey = source.runtime
              ? `${source.zone}.${source.runtime}`
              : source.zone;
            const tgtKey = target.runtime
              ? `${target.zone}.${target.runtime}`
              : target.zone;
            realizedEdges.add(`${srcKey}\0${tgtKey}`);
            continue;
          }

          const reason =
            result === "deny"
              ? "denied by boundary rule"
              : "no allow rule (default-deny)";

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

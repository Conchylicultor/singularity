// Contributed checks guarding the per-plugin web-artifact composition.
//
// BOTH are `scope: "deploy"`: their subject is the local deployment `build`
// produces — `web-core/dist` (gitignored) and the `~/.singularity/web-artifacts`
// store (outside any repo) — not the tree. So neither is in the push payload,
// and `push` (which asks for `--scope tree`) does not run them; `build`, a
// standalone `./singularity check`, and main's post-push auto-build do. Each
// therefore owes a `cacheSignature()` covering that deploy state, since the
// runner's tree hash does not reach it — see `Check.scope`.
//
//   web-artifacts:map-in-sync — the deployed artifact dist's import map is the
//   one the CURRENT tree composes. A monolith dist passes (nothing to verify);
//   a stale map fails with the `./singularity build` fix. Skips (uncached)
//   inside a `./singularity build` process, where the dist under inspection is
//   the one that very build is about to replace — standalone runs verify for
//   real.
//
//   web-artifacts:no-vendored-state-inlined — no plugin artifact in the current
//   fleet's expected set bundles modules of an npm package outside the inline
//   allowlist. Vendoring is what guarantees one module instance per package;
//   an inlined copy of a stateful package (React context registries, scheduler,
//   …) is the silent dual-instance bug class. Verdicts are cached per artifact
//   dir (content-addressed ⇒ immutable) so the sourcemap scan is one-time.
//
// `scope` and `isBuildInProgress()` are ORTHOGONAL — neither subsumes the other,
// and deleting either as redundant reopens a real hole:
//   - `isBuildInProgress()` (run-context) answers "a build races its own
//     publish": a build MUST run these checks — it IS the deploy — but at check
//     time its dist is still the previous one, so the comparison is skipped for
//     that one process.
//   - `scope` answers "push is not a deploy": push never inspects the dist at
//     all, whatever process is or isn't building.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Check, CheckResult } from "@plugins/framework/plugins/tooling/core";
import { isBuildInProgress } from "@plugins/framework/plugins/tooling/plugins/checks/core";
import { WEB_CORE_RELATIVE } from "@plugins/infra/plugins/paths/server";
import { INLINE_PACKAGES } from "../core/constants";
import { diffImportMaps } from "../core/import-map";
import { computeExpectedComposition, planExpectedFleet } from "../core/internal/expected";
import {
  artifactStorePath,
  hasArtifact,
  WEB_ARTIFACTS_DIR,
  WEB_ARTIFACTS_STORE_DIR,
} from "../core/internal/store";
import {
  extractEntryScriptSrc,
  extractImportMap,
  offendingPackages,
  packagesInSourcemapSources,
} from "./scan";

const MARKER_NAME = ".web-artifacts.json";
const BUILD_HINT = "Run `./singularity build` to recompose the dist from the current tree.";

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

function rootSync(): string {
  const proc = Bun.spawnSync(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return new TextDecoder().decode(proc.stdout).trim();
}

function distDir(root: string): string {
  return join(root, WEB_CORE_RELATIVE, "dist");
}

function readIfExists(file: string): string | null {
  try {
    return readFileSync(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    return null;
  }
}

/** The dist's recorded minify flag (Phase-1 markers lack it → the default, true). */
function markerMinify(markerRaw: string): boolean {
  const parsed = JSON.parse(markerRaw) as { minify?: boolean };
  return typeof parsed.minify === "boolean" ? parsed.minify : true;
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function storeMtime(): string {
  try {
    return String(statSync(WEB_ARTIFACTS_STORE_DIR).mtimeMs);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    return "no-store";
  }
}

function truncatedList(items: readonly string[], max = 15): string {
  const shown = items.slice(0, max).map((i) => `  ${i}`);
  if (items.length > max) shown.push(`  … and ${items.length - max} more`);
  return shown.join("\n");
}

const mapInSync: Check = {
  id: "web-artifacts:map-in-sync",
  description:
    "the deployed artifact-mode dist's import map matches the composition the current tree produces (monolith dists pass)",
  scope: "deploy",
  cacheSignature(): string | null {
    // Never cache the build-time skip: a cached "pass" recorded while the check
    // didn't actually look would mask a stale dist on the next run that does.
    if (isBuildInProgress()) return null;
    const dist = distDir(rootSync());
    const marker = readIfExists(join(dist, MARKER_NAME));
    if (marker === null) return "monolith-dist";
    const html = readIfExists(join(dist, "index.html")) ?? "";
    // The verdict depends on the deployed dist AND on which artifacts the store
    // holds (the expected map is recomputed through store metas) — fold both in.
    return sha256(`${marker}\n${html}\n${storeMtime()}`);
  },
  async run(): Promise<CheckResult> {
    // See run-context.ts: during `./singularity build` the checks race the
    // frontend build, so the deployed dist is by definition the one this build
    // replaces — comparing it against the current tree would fail every build
    // that changes source. Push/standalone runs verify for real.
    if (isBuildInProgress()) return { ok: true };

    const root = await getRoot();
    const dist = distDir(root);
    const markerRaw = readIfExists(join(dist, MARKER_NAME));
    // No marker ⇒ a monolith dist (or nothing deployed yet): a genuine pass —
    // there is no artifact composition to verify.
    if (markerRaw === null) return { ok: true };

    const html = readIfExists(join(dist, "index.html"));
    if (html === null) {
      return {
        ok: false,
        message: `artifact-mode dist marker present but ${join(dist, "index.html")} is missing`,
        hint: BUILD_HINT,
      };
    }
    const deployed = extractImportMap(html);
    if (deployed === null) {
      return {
        ok: false,
        message: "artifact-mode dist's index.html carries no inline import map",
        hint: BUILD_HINT,
      };
    }

    const expected = await computeExpectedComposition({ root, minify: markerMinify(markerRaw) });
    if (expected.kind === "missing-artifacts") {
      return {
        ok: false,
        message:
          `the deployed dist predates the current tree: ${expected.missing.length} artifact(s) the ` +
          `current tree composes are absent from the store:\n${truncatedList(expected.missing)}`,
        hint: BUILD_HINT,
      };
    }

    const diff = diffImportMaps(deployed, expected.imports);
    const problems: string[] = [];
    if (diff.changed.length > 0) {
      problems.push(
        `${diff.changed.length} specifier(s) point at a stale artifact:\n` +
          truncatedList(diff.changed.map((c) => `${c.specifier}: ${c.deployed} → ${c.expected}`)),
      );
    }
    if (diff.missing.length > 0) {
      problems.push(
        `${diff.missing.length} expected specifier(s) missing from the deployed map:\n` +
          truncatedList(diff.missing),
      );
    }
    if (diff.extra.length > 0) {
      problems.push(
        `${diff.extra.length} deployed specifier(s) the current tree no longer composes:\n` +
          truncatedList(diff.extra),
      );
    }
    const deployedEntry = extractEntryScriptSrc(html);
    if (deployedEntry !== expected.entryUrl) {
      problems.push(
        `entry script: deployed ${deployedEntry ?? "<none>"}, expected ${expected.entryUrl}`,
      );
    }
    if (problems.length > 0) {
      return {
        ok: false,
        message: `deployed import map is out of sync with the current tree:\n${problems.join("\n")}`,
        hint: BUILD_HINT,
      };
    }
    return { ok: true };
  },
};

// ── no-vendored-state-inlined ───────────────────────────────────────

const SCANNER_VERSION = 1;
const SCAN_CACHE_FILE = join(WEB_ARTIFACTS_DIR, "vendored-scan.json");

interface VendoredScanCache {
  version: number;
  /** artifact dirName → ALL node_modules packages found in its sourcemap.
   * Unfiltered by the allowlist, so an allowlist edit re-filters without
   * re-scanning; immutable per dirName (content-addressed artifacts). */
  inlined: Record<string, string[]>;
}

function loadScanCache(): VendoredScanCache {
  const raw = readIfExists(SCAN_CACHE_FILE);
  if (raw !== null) {
    try {
      const parsed = JSON.parse(raw) as VendoredScanCache;
      if (parsed.version === SCANNER_VERSION && typeof parsed.inlined === "object") {
        return parsed;
      }
    } catch (err) {
      if (!(err instanceof SyntaxError)) throw err;
    }
  }
  return { version: SCANNER_VERSION, inlined: {} };
}

function saveScanCache(cache: VendoredScanCache): void {
  // Keep only verdicts whose artifact still exists — bounds the file to the
  // live store. Atomic write (concurrent check runs: last writer wins; verdicts
  // are immutable, a lost entry merely re-scans).
  const inlined: Record<string, string[]> = {};
  for (const [dirName, pkgs] of Object.entries(cache.inlined)) {
    if (hasArtifact(dirName)) inlined[dirName] = pkgs;
  }
  const tmp = `${SCAN_CACHE_FILE}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify({ version: SCANNER_VERSION, inlined }));
  renameSync(tmp, SCAN_CACHE_FILE);
}

/** Scan one store artifact's sourcemap for inlined node_modules packages. */
function scanArtifact(dirName: string): string[] {
  const mapFile = join(artifactStorePath(dirName), "index.js.map");
  const raw = readIfExists(mapFile);
  if (raw === null) {
    // The builder emits sourcemaps unconditionally — a missing map means the
    // scan has no signal, which must be loud, not a silent pass.
    throw new Error(`artifact ${dirName} has no index.js.map — cannot verify inlined modules`);
  }
  // Fast path: no `node_modules/` substring anywhere ⇒ no npm module inlined
  // (spares the JSON.parse of multi-MB maps for the overwhelmingly common case).
  if (!raw.includes("node_modules/")) return [];
  const parsed = JSON.parse(raw) as { sources?: string[] };
  return packagesInSourcemapSources(parsed.sources ?? []);
}

const noVendoredStateInlined: Check = {
  id: "web-artifacts:no-vendored-state-inlined",
  description:
    "no web artifact in the current fleet bundles modules of an npm package outside the inline allowlist (the module-identity / dual-instance guard)",
  scope: "deploy",
  cacheSignature(): string {
    // The verdict is a function of the tree (expected fleet) — covered by the
    // runner's tree hash — plus which artifacts the store holds.
    return storeMtime();
  },
  async run(): Promise<CheckResult> {
    if (!existsSync(WEB_ARTIFACTS_STORE_DIR)) return { ok: true }; // nothing composed yet

    const root = await getRoot();
    const markerRaw = readIfExists(join(distDir(root), MARKER_NAME));
    const minify = markerRaw === null ? true : markerMinify(markerRaw);

    // The expected fleet for the current tree; artifacts not (yet) in the store
    // are skipped — staleness is map-in-sync's job, this check verifies the
    // content of what exists. The registry artifact is excluded by construction
    // (type-stripped transform, never bundles).
    const fleet = await planExpectedFleet({ root, minify });
    const present = fleet.targets.filter((t) => hasArtifact(t.dirName));
    if (present.length === 0) return { ok: true }; // nothing composed yet

    const cache = loadScanCache();
    let scanned = 0;
    const offenders: string[] = [];
    for (const t of present) {
      let inlined = cache.inlined[t.dirName];
      if (inlined === undefined) {
        inlined = scanArtifact(t.dirName);
        cache.inlined[t.dirName] = inlined;
        scanned++;
      }
      const offending = offendingPackages(inlined, INLINE_PACKAGES);
      if (offending.length > 0) {
        offenders.push(`${t.dirName}: ${offending.join(", ")}`);
      }
    }
    if (scanned > 0) saveScanCache(cache);

    if (offenders.length > 0) {
      return {
        ok: false,
        message:
          `${offenders.length} artifact(s) bundle npm modules outside the inline allowlist ` +
          `(INLINE_PACKAGES in web-artifacts/core/constants.ts) — each inlined copy is a second ` +
          `module instance next to the vendored one (the React-context dual-instance bug class):\n` +
          truncatedList(offenders),
        hint:
          "Fix the externals rule regression (web-artifacts/core/externals.ts) — or, ONLY for a " +
          "provably stateless package, extend INLINE_PACKAGES. Then bump BUILDER_VERSION and rebuild.",
      };
    }
    return { ok: true };
  },
};

export default [mapInSync, noVendoredStateInlined];

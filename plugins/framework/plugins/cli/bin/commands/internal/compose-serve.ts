// Compose-serve stage: at the end of a MAIN build, every ACTIVATED composition
// (`autoBuild: true` in the `compositions` config, read from main's RESOLVED
// config — git layer + user edits, never code defaults) is composed into its
// own gateway namespace under `~/.singularity/worktrees/<id>/`:
//
//   per-name registries → web dist (import-map compose over the shared
//   artifact store, reusing main's vendor set) → empty DB → propagated config
//   → `composition.json` provenance marker → `spec.json` LAST → gateway restart.
//
// The spec write is last on purpose (mirrors `bootSelfContainedApp`): the
// gateway discovers the namespace only once its DB and dist exist, so a
// freshly-spawned backend never races DB creation (a 3D000 boot crash is not
// retried). Deactivated compositions are swept (spec dir + dist + marker +
// per-name registries); the DB is deliberately KEPT — dropping it stays a
// manual operation. Design: research/2026-07-17-global-composition-auto-serve.md.

import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  assertServableCompositionNamespace,
  buildRegistryGenContext,
  generateCompositionRegistry,
  listNamedCompositionRegistries,
  propagateConfigToUser,
  readEffectiveConfigFromDisk,
  type RegistryGenContext,
} from "@plugins/framework/plugins/tooling/plugins/codegen/core";
import {
  compositionFleetSource,
  readFleetVendorMeta,
  runWebArtifactsPipeline,
  type VendorSetMeta,
} from "@plugins/framework/plugins/tooling/plugins/web-artifacts/core";
import {
  compositionsConfig,
  manifestItemToManifest,
  type CompositionManifestItem,
} from "@plugins/plugin-meta/plugins/composition/core";
import { classifyEdges, flattenManifest, resolveComposition } from "@plugins/plugin-meta/plugins/closure/core";
import type { CompositionManifest, EdgeGraph } from "@plugins/plugin-meta/plugins/closure/core";
import { buildPluginTree } from "@plugins/plugin-meta/plugins/plugin-tree/core";
import { asPath, asPluginId } from "@plugins/framework/plugins/plugin-id/core";
import {
  writeWorktreeSpec,
  removeWorktreeSpec,
  namespaceCollision,
  probeNamespace,
  COMPOSITION_MARKER_FILE,
  type CompositionMarker,
} from "@plugins/infra/plugins/worktree/server";
import { ensureDatabase, getAdminPool } from "@plugins/database/plugins/admin/server";
import type { BuildRunRecorder } from "@plugins/build/plugins/run-ledger/server";
import { SINGULARITY_DIR, WORKTREES_DIR, MAIN_WORKTREE_NAME } from "../../paths";
import type { SpanCollector } from "../../profiler";
import type { StepLogCollector } from "../../build-logs-writer";
import { distStagingPath, publishDistAtomic, sweepDistLeftovers } from "./dist-publish";

// The `compositions` config's owning plugin — where its jsonc files live under
// `config/` and the per-worktree user config dir.
const COMPOSITIONS_HIERARCHY_PATH = asPath(asPluginId("plugin-meta.composition"));

export interface ComposeServeOptions {
  /** The MAIN checkout root — the stage never runs from an agent worktree. */
  root: string;
  minify: boolean;
  buildId: string;
  buildCommit: string;
  /**
   * `--serve-composition`: force this one composition through the stage
   * regardless of its `autoBuild` toggle. A forced run never sweeps — other
   * active compositions must not be deactivated by a dev iteration on one.
   */
  force?: string;
  log: (line: string) => void;
  /**
   * Stage wrapper — the caller records profiler spans here. Now used for exactly
   * ONE summary bar per composition (`compose:<id>`) plus `compose:prepare` in
   * MAIN's profile; each composition's own sub-stages go to its own collectors
   * (see `createProfile`/`createLogs`), not here.
   */
  onStage: <T>(id: string, label: string, run: () => Promise<T>) => Promise<T>;
  /**
   * Records each composition build as its own `build_runs` row (child of
   * `parentBuildId`), with its own profile / step-log artifacts. Main-only, so
   * the recorder targets main's DB — which is exactly where compose-serve runs.
   */
  recorder: BuildRunRecorder;
  /** The parent (main) build's id; each composition row's run-id derives from it. */
  parentBuildId: string;
  /** Fresh per-composition span collector — its own `t0`, its own profile file. */
  createProfile: () => SpanCollector;
  /** Fresh per-composition step-log collector — its own steps, its own log files. */
  createLogs: () => StepLogCollector;
}

export interface ComposeServeResult {
  served: string[];
  swept: string[];
  failures: Array<{ id: string; error: string }>;
}

/**
 * Main's ACTIVATED composition set — the `autoBuild: true` manifests of the
 * resolved `compositions` config. The authoritative worktree is `singularity`
 * (main's UI is where the toggle lives): flipping it in a non-main worktree UI
 * has no effect until the edit reaches main.
 */
export function readCompositionItems(root: string): CompositionManifestItem[] {
  const values = readEffectiveConfigFromDisk(compositionsConfig, {
    root,
    worktreeName: MAIN_WORKTREE_NAME,
    singularityDir: SINGULARITY_DIR,
    hierarchyPath: COMPOSITIONS_HIERARCHY_PATH,
  });
  return values.manifests;
}

export function activatedCompositionIds(items: CompositionManifestItem[]): string[] {
  return items.filter((i) => i.autoBuild).map((i) => i.id);
}

/** The namespaces to deactivate: everything present that is no longer activated. */
export function sweepIds(
  present: Iterable<string>,
  activated: ReadonlySet<string>,
): string[] {
  return [...new Set(present)].filter((id) => !activated.has(id)).sort();
}

// Atomic (temp + rename) like spec.json — a torn marker would make the dir read
// as foreign and permanently fail the collision guard.
function writeMarker(specDir: string, marker: CompositionMarker): void {
  mkdirSync(specDir, { recursive: true });
  const path = join(specDir, COMPOSITION_MARKER_FILE);
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(marker, null, 2) + "\n");
  renameSync(tmp, path);
}

async function serveOne(opts: {
  item: CompositionManifestItem;
  allManifests: CompositionManifest[];
  graph: EdgeGraph;
  ctx: RegistryGenContext;
  vendors: VendorSetMeta;
  stage: ComposeServeOptions;
}): Promise<void> {
  const { item, stage } = opts;
  const id = item.id;
  const { root, log } = stage;

  // Deterministic child run-id: route-valid, filename-valid, prune-regex-safe.
  const compRunId = `${stage.parentBuildId}-c-${id}`;
  // Open the composition's build_runs row BEFORE any work, so it exists (as
  // "Building…") for the whole build and a mid-build crash leaves an OPEN row the
  // reconcile / next-insert sweep can recover. insertCompositionRun sweep-closes
  // any stale open row for this target first (the file build-lock guarantees no
  // genuinely-concurrent compose for the same target).
  await stage.recorder.insertCompositionRun({
    id: compRunId,
    target: id,
    parentId: stage.parentBuildId,
    pid: process.pid,
  });

  // This composition's OWN collectors. Each is re-based to its own start (fresh
  // t0 / empty steps) and its artifacts are written under MAIN's worktree data
  // dir keyed by compRunId — exactly what the per-run build-logs / build-profiling
  // detail endpoints read. Main's profile keeps only the one `compose:<id>`
  // summary bar the caller wraps around this call.
  const prof = stage.createProfile();
  const logs = stage.createLogs();

  // Local stage wrapper feeding BOTH the composition profile (one span) and its
  // step log (one step) per sub-stage — replacing the old prefixing of sub-stages
  // into main's single profile. `phase` is a real build phase so the composition's
  // profile renders through the same closed-phase-set Gantt as any build run.
  const compStage = async <T>(
    sid: string,
    phase: string,
    label: string,
    run: () => Promise<T>,
  ): Promise<T> => {
    const endSpan = prof.start(sid, phase, label);
    const endStep = logs.beginStep(sid, label);
    try {
      const r = await run();
      endStep(true);
      return r;
    } catch (e) {
      endStep(false);
      throw e;
    } finally {
      endSpan();
    }
  };

  // Route this composition's log lines into its own step log (appended to
  // whatever step compStage currently has open, or an implicit "output" step)
  // AS WELL AS main's console via `log`, so the composition run's Logs detail
  // section is populated.
  const compLog = (line: string): void => {
    log(line);
    logs.line(line, "stdout");
  };

  let ok = false;
  try {
    assertServableCompositionNamespace(id);
    const collision = namespaceCollision(id, probeNamespace(root, id));
    if (collision !== null) throw new Error(`compose-serve "${id}": ${collision}`);

    const specDir = join(WORKTREES_DIR, id);
    // Marker FIRST (right after the guard): from the moment we start writing into
    // the namespace dir it must read as compose-serve-owned, or a crash mid-build
    // would leave a marker-less dir the guard then refuses forever.
    writeMarker(specDir, { composition: id, builtAt: new Date().toISOString(), buildId: stage.buildId });

    const flat = flattenManifest(manifestItemToManifest(item), opts.allManifests);
    const bundle = resolveComposition(opts.graph, flat).bundle;
    compLog(`compose-serve "${id}": ${bundle.size} plugins in closure`);

    await compStage("registry", "build:codegen", "generate registry", () =>
      generateCompositionRegistry({ root, bundle, name: id, ctx: opts.ctx }),
    );

    const distDir = join(specDir, "web");
    await sweepDistLeftovers(distDir);
    const stagingPath = distStagingPath(distDir);
    const source = await compositionFleetSource({ root, name: id });
    const result = await runWebArtifactsPipeline({
      root,
      stagingDir: stagingPath,
      minify: stage.minify,
      buildId: stage.buildId,
      source,
      vendors: opts.vendors,
      log: (line) => compLog(`compose-serve "${id}": ${line}`),
      // Each pipeline sub-stage becomes one span+step in the composition's own
      // profile/log (phase build:frontend, mirroring main's own web-artifacts
      // staging), never a span in main's profile.
      onStage: (sid, label, run) => compStage(sid, "build:frontend", label, run),
    });
    compLog(
      `compose-serve "${id}": ${result.builtArtifacts} built, ${result.reusedArtifacts} reused, ` +
        `${result.preloads} preloads`,
    );

    // Same trailer files as main's dist, so the served backend reports drift and
    // stale tabs identically.
    if (stage.buildCommit) {
      writeFileSync(resolve(stagingPath, ".build-commit"), stage.buildCommit + "\n");
    }
    writeFileSync(resolve(stagingPath, ".build-id"), stage.buildId + "\n");
    await publishDistAtomic({ dir: distDir, stagingPath });

    // Empty DB, created race-safely; the backend's boot migrator populates the
    // schema on first spawn. Never a fork of main's data.
    await compStage("database", "build:database", "ensure database", () => ensureDatabase(id));

    await compStage("config", "build:codegen", "propagate config", () =>
      propagateConfigToUser({ root, worktreeName: id, singularityDir: SINGULARITY_DIR }),
    );

    // Spec LAST — the gateway only discovers the namespace once DB + dist exist.
    // zeroCache is deliberately omitted in v1: the zero sidecar is an opt-in
    // (SINGULARITY_ZERO_CACHE) replication accelerator, not required for a
    // functioning app; per-composition sidecars are a follow-up if ever needed.
    await compStage("deploy", "build:deploy", "register + restart", async () => {
      writeWorktreeSpec({
        name: id,
        server: resolve(root, "plugins/framework/plugins/server-core"),
        web: distDir,
      });
      await restartNamespace(id, compLog);
    });
    ok = true;
  } finally {
    // Write this composition's own profile + step-log artifacts (keyed by
    // compRunId under main's worktree data dir), then close its row. Written on
    // both success and failure so a failed composition still has a Logs /
    // Profiling detail to inspect. closeRun is guarded (isNull(finishedAt)).
    prof.write(MAIN_WORKTREE_NAME, compRunId);
    logs.write(MAIN_WORKTREE_NAME, compRunId);
    await stage.recorder.closeRun(compRunId, ok ? 0 : 1);
  }
}

// Mirrors build.ts's gateway-notify tolerance: 404 = not running (spawns on
// first request), connection refused / timeout = gateway down; anything else
// unexpected is rethrown.
async function restartNamespace(id: string, log: (line: string) => void): Promise<void> {
  try {
    const resp = await fetch(`http://localhost:9000/gateway/worktrees/${id}/restart`, {
      method: "POST",
      signal: AbortSignal.timeout(30_000),
    });
    if (resp.ok) {
      log(`compose-serve "${id}": backend restarted`);
    } else if (resp.status === 404) {
      log(`compose-serve "${id}": no running backend — will spawn on first request`);
    } else {
      log(`compose-serve "${id}": restart returned ${resp.status}`);
    }
  } catch (err) {
    if (!(err instanceof TypeError) && !(err instanceof DOMException)) throw err;
    log(`compose-serve "${id}": gateway not reachable — will spawn on first request`);
  }
}

function markerNamespaces(): string[] {
  if (!existsSync(WORKTREES_DIR)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(WORKTREES_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (existsSync(join(WORKTREES_DIR, entry.name, COMPOSITION_MARKER_FILE))) out.push(entry.name);
  }
  return out;
}

export async function runComposeServeStage(
  opts: ComposeServeOptions,
): Promise<ComposeServeResult> {
  const { root, log } = opts;
  const items = readCompositionItems(root);
  const activated = activatedCompositionIds(items);

  let buildTargets: CompositionManifestItem[];
  if (opts.force !== undefined) {
    const forced = items.find((i) => i.id === opts.force);
    if (!forced) {
      throw new Error(
        `--serve-composition: unknown composition "${opts.force}". ` +
          `Known: ${items.map((i) => i.id).join(", ")}`,
      );
    }
    buildTargets = [forced];
  } else {
    const byId = new Map(items.map((i) => [i.id, i]));
    buildTargets = activated.map((id) => byId.get(id)!);
  }

  const failures: ComposeServeResult["failures"] = [];
  const served: string[] = [];

  try {
    if (buildTargets.length > 0) {
      const { graph, ctx, vendors } = await opts.onStage(
        "compose:prepare",
        `compose-serve prepare (${buildTargets.length} composition(s))`,
        async () => {
          // ONE tree walk + ONE edge classification + ONE registry-gen context,
          // shared across every composition this build serves.
          const tree = await buildPluginTree(join(root, "plugins"), {
            skipBarrelImport: true,
            facets: true,
          });
          return {
            graph: classifyEdges(tree),
            ctx: await buildRegistryGenContext(root),
            // Main's full-fleet vendor set — a composition's targets are a strict
            // subset of the fleet, so reusing it is exact (extra entries inert).
            vendors: await readFleetVendorMeta({ root, minify: opts.minify }),
          };
        },
      );
      const allManifests = items.map(manifestItemToManifest);

      for (const item of buildTargets) {
        try {
          // Exactly ONE summary bar per composition in MAIN's profile (its
          // sub-stages live in the composition's own profile). `compose:prepare`
          // above is the other compose-phase span main keeps.
          await opts.onStage(`compose:${item.id}`, item.id, () =>
            serveOne({ item, allManifests, graph, ctx, vendors, stage: opts }),
          );
          served.push(item.id);
          log(`compose-serve "${item.id}": serving at http://${item.id}.localhost:9000`);
        } catch (err) {
          const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
          failures.push({ id: item.id, error: message });
          log(`compose-serve "${item.id}": FAILED — ${message}`);
        }
      }
    }

    // Deactivation sweep — full config-driven runs only (a forced run must not
    // deactivate siblings). Everything carrying our marker OR a leftover
    // per-name registry, minus the activated set. The DB is KEPT.
    const swept: string[] = [];
    if (opts.force === undefined) {
      const registries = listNamedCompositionRegistries(root);
      const markers = new Set(markerNamespaces());
      const present = [...markers, ...registries.map((r) => r.name)];
      for (const id of sweepIds(present, new Set(activated))) {
        try {
          // Namespace dir only when it carries OUR marker — a registry-only
          // leftover must never delete a same-named foreign namespace dir.
          if (markers.has(id)) {
            await removeWorktreeSpec(id); // spec + dist + marker: the whole namespace dir
          }
          for (const r of registries) {
            if (r.name === id) rmSync(r.file, { force: true });
          }
          swept.push(id);
          log(`compose-serve: deactivated "${id}" (spec + dist + registries removed; DB kept)`);
        } catch (err) {
          const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
          failures.push({ id, error: `deactivation sweep: ${message}` });
          log(`compose-serve: sweep of "${id}" FAILED — ${message}`);
        }
      }
    }

    return { served, swept, failures };
  } finally {
    // The stage is the build's last DB user; release the admin pool's idle
    // client so the CLI process can exit immediately instead of waiting out
    // the pool's idle timeout.
    await getAdminPool().end();
  }
}

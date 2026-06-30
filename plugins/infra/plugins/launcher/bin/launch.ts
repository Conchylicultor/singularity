/**
 * Release launcher — the compiled `launch` binary, the artifact's entrypoint.
 *
 * Compiled by `release.ts` via `bun build --compile` and placed at the bundle
 * root, next to `gateway/`, `server`, `web/`, `pg/`, `pgbouncer/`, and
 * `RELEASE.json`. Running it brings up the whole self-contained app on a fresh
 * host with no bun, no Go toolchain, and no node_modules.
 *
 * CRITICAL ordering: every path constant under `@plugins/infra/plugins/paths`
 * is FROZEN at import time from `SINGULARITY_DIR` (+ the PG/PgBouncer bin-dir
 * overrides are read by the start scripts at spawn time). So this file must set
 * those env vars BEFORE importing anything path-dependent. We therefore do NOT
 * statically import the launcher boot code — we `await import(...)` it only
 * after the env is in place, so the constants freeze under the release root.
 */
import { dirname, join } from "node:path";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";

// `process.execPath` is the compiled `launch` binary; its dir is the bundle
// root (the extracted bundle dir when packed, or the staged dir for `--dev`).
const bundleRoot = dirname(process.execPath);

// Re-root the entire install under the bundle (data, logs, the PG cluster, the
// registry, the pid file) so a release never touches the dev `~/.singularity`.
// `??=` lets an operator override the data root (e.g. point at a persistent
// volume) without editing the binary.
process.env.SINGULARITY_DIR ??= join(bundleRoot, "data");
// Point the compiled pg-start / pgbouncer-start at the vendored native trees.
// The gateway inherits this env and passes it to the supervised start binaries.
process.env.SINGULARITY_PG_BIN_DIR ??= join(bundleRoot, "pg", "native", "bin");
process.env.SINGULARITY_PGBOUNCER_BIN ??= join(
  bundleRoot,
  "pgbouncer",
  "native",
  "bin",
  "pgbouncer",
);
// The migration runner reads its `.sql` files from disk; `import.meta.dir`
// resolves into the compiled binary's virtual FS, so point it at the vendored
// `migrations/data` tree. The gateway inherits this and forwards it to the
// spawned backend, which is the process that actually runs migrations.
process.env.SINGULARITY_MIGRATIONS_DIR ??= join(
  bundleRoot,
  "migrations",
  "data",
);
// Reroot the embedded-PG and PgBouncer Unix sockets onto a short `/tmp` path
// (both read this single override). The data root above may be a long versioned
// `<out>/data` (`releases/<wt>/<comp>-<target>/<run-id>/data`), which would blow
// the 104-byte socket-path cap; the socket dir is decoupled so length never
// constrains where a release is staged.
process.env.SINGULARITY_PG_SOCKET_DIR ??= mkdtempSync(join("/tmp", "sgs-"));

interface ReleaseManifest {
  composition: string;
  target: string;
  platform: string;
  builtAt: string;
  port: number;
  runId?: string;
}

function readReleaseManifest(): ReleaseManifest {
  const path = join(bundleRoot, "RELEASE.json");
  if (!existsSync(path)) {
    throw new Error(
      `RELEASE.json not found at ${path}. The launch binary must sit at the bundle root next to RELEASE.json.`,
    );
  }
  return JSON.parse(readFileSync(path, "utf-8")) as ReleaseManifest;
}

async function main(): Promise<void> {
  const manifest = readReleaseManifest();
  const name = manifest.composition;
  // PORT env override lets an operator pick the listen port without rebuilding;
  // otherwise the port baked into RELEASE.json wins.
  const port = process.env.PORT ? Number(process.env.PORT) : manifest.port;
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid port: ${process.env.PORT ?? manifest.port}`);
  }

  // Imported AFTER env is set, so the launcher's path constants freeze under the
  // release root.
  const { bootSelfContainedApp, writeReleaseDatabaseConfig, seedReleaseAssetMirror } =
    await import("@plugins/infra/plugins/launcher/server");

  // Write the release database.json FIRST, so bootSelfContainedApp's internal
  // ensureDatabaseConfig sees the file already present and no-ops (a release has
  // no node_modules to probe). The service `start` argv point at the vendored
  // compiled start binaries.
  writeReleaseDatabaseConfig(
    {
      pgStartBin: join(bundleRoot, "pg", "pg-start"),
      pgbouncerStartBin: join(bundleRoot, "pgbouncer", "pgbouncer-start"),
    },
    console.log,
  );

  // Seed the asset-mirror cache from the bundle on first run (copy-if-absent),
  // so offline cold starts have their pre-warmed assets before the backend
  // serves any mirror request. Routed through the launcher/server barrel this
  // bin already dynamic-imports (after the env freeze): a bin entrypoint may not
  // statically import path-dependent code, and the boundary rules (R9) forbid a
  // literal cross-plugin dynamic import — so the launcher owns the boot step and
  // delegates the copy mechanics + dirname to asset-mirror.
  seedReleaseAssetMirror({
    bundleRoot,
    dataDir: process.env.SINGULARITY_DIR!,
    log: console.log,
  });

  await bootSelfContainedApp({
    name,
    // The compiled backend's cwd. The binary is self-contained (closure bundled
    // by `bun --compile`), so cwd is not load-bearing — bundleRoot is a stable
    // existing dir.
    server: bundleRoot,
    // The gateway spawns the compiled backend via this argv (Spec.command),
    // instead of its `bun bin/index.ts` convention.
    command: [join(bundleRoot, "server")],
    web: join(bundleRoot, "web"),
    port,
    // buildOrLocateGateway skips `go build` because <repoRoot>/gateway/gateway
    // (the vendored prebuilt) already exists.
    repoRoot: bundleRoot,
    log: console.log,
  });

  console.log("");
  console.log(`App "${name}" is serving.`);
  console.log(`  URL:  http://${name}.localhost:${port}`);
  console.log(`  Root: ${process.env.SINGULARITY_DIR}`);
}

await main();

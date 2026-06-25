/**
 * Release teardown — the compiled `teardown` binary, the bundle's stop entrypoint.
 *
 * Mirror of `launch.ts`'s env-rooting preamble, then stops the self-contained
 * stack (gateway → PgBouncer → Postgres) via the pidfiles under the data root.
 * It only signals pidfiles — it does NOT delete the data dir — so a packaged
 * install's songs/DB persist across app restarts.
 *
 * Invoked by the desktop (Tauri) shell on app exit with the SAME `SINGULARITY_DIR`
 * / `PORT` env the launcher saw, so it tears down exactly the stack `launch`
 * brought up. The gateway / Postgres are detached daemons (not the shell's
 * children), so pidfile-based teardown is the authoritative stop.
 *
 * CRITICAL ordering (same as launch.ts): set the path env BEFORE importing
 * anything path-dependent, then `await import(...)` so the constants freeze under
 * the release root.
 */
import { dirname, join } from "node:path";
import { existsSync, readFileSync } from "node:fs";

// `process.execPath` is the compiled `teardown` binary; its dir is the bundle
// root (extracted bundle dir when packed, or the staged dir for `--dev`).
const bundleRoot = dirname(process.execPath);

// Re-root under the bundle, matching launch.ts. `??=` lets the desktop shell (or
// an operator) point at the actual install root via inherited env.
const dataRoot = (process.env.SINGULARITY_DIR ??= join(bundleRoot, "data"));

interface ReleaseManifest {
  composition: string;
  target: string;
  platform: string;
  builtAt: string;
  port: number;
}

function readReleaseManifest(): ReleaseManifest {
  const path = join(bundleRoot, "RELEASE.json");
  if (!existsSync(path)) {
    throw new Error(
      `RELEASE.json not found at ${path}. The teardown binary must sit at the bundle root next to RELEASE.json.`,
    );
  }
  return JSON.parse(readFileSync(path, "utf-8")) as ReleaseManifest;
}

async function main(): Promise<void> {
  const manifest = readReleaseManifest();
  // The HTTP listen port: PORT override wins, else the baked manifest value —
  // identical resolution to launch.ts, so teardown targets the right gateway.
  const httpPort = process.env.PORT ? Number(process.env.PORT) : manifest.port;

  // Imported AFTER env is set, so the launcher's path constants freeze under the
  // release root. (Same-plugin dynamic import — the env-before-import ordering
  // launch.ts relies on; teardown itself only needs `root`, which it passes
  // explicitly.)
  const { teardownSelfContainedApp } = await import(
    "@plugins/infra/plugins/launcher/server"
  );

  // PG is killed via its postmaster pidfile under `root` — the authoritative
  // stop. The pgPort arg is only a loopback-TCP backstop, relevant when the
  // cluster runs on a non-default port; a desktop install uses the default, so we
  // pass it through only when SINGULARITY_PG_PORT is explicitly set. (Reading the
  // env here avoids a cross-plugin import of the embedded PG_PORT constant.)
  const pgPortRaw = process.env.SINGULARITY_PG_PORT;
  const pgPort = pgPortRaw ? Number(pgPortRaw) : undefined;

  await teardownSelfContainedApp(
    {
      root: dataRoot,
      httpPort:
        Number.isInteger(httpPort) && httpPort > 0 ? httpPort : undefined,
      pgPort:
        pgPort !== undefined && Number.isInteger(pgPort) && pgPort > 0
          ? pgPort
          : undefined,
    },
    console.log,
  );
}

await main();

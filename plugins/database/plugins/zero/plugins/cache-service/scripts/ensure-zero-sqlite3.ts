#!/usr/bin/env bun
/**
 * Ensures @rocicorp/zero-sqlite3's native binary is built for the ABI of the
 * Node runtime that zero-cache actually runs under (Node 24, NODE_MODULE_VERSION
 * 137) — NOT the host `node` that bun would otherwise pick (Node 25, ABI 141),
 * which loads under Node 24 with ERR_DLOPEN_FAILED.
 *
 * Why this exists as a dedicated step rather than the package's normal install:
 * the ABI pin (npm_config_runtime / npm_config_target, read by prebuild-install
 * and node-gyp) is GLOBAL to a `bun install` — bun can't scope lifecycle-script
 * env per package — so pinning it around the whole install would mis-target any
 * future native dep bun dlopen's at runtime. So zero-sqlite3 is intentionally
 * NOT a trustedDependency (bun never builds it during install), and this script
 * builds it in a single subprocess whose env carries the pin and nothing else.
 *
 * Wired as the root `postinstall` (alongside e2e/ensure-chromium.mjs) so the
 * binary is provisioned by the same mechanism — `bun install` — that provisions
 * the package, and they can never drift. Steady state is a noop: one resolve +
 * one stat, then exit.
 */
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";

// Any 24.x target yields the same ABI (NODE_MODULE_VERSION 137), which is what
// the supervised zero-cache service (resolveNode → major 22/24) loads under.
const ZERO_SQLITE3_NODE_TARGET = "24.17.0";

// scripts/ -> cache-service plugin root, the resolution base for its deps.
// zero-sqlite3 is a transitive dep of @rocicorp/zero (the cache-service's direct
// dep), not of the plugin itself, so resolve it RELATIVE TO @rocicorp/zero —
// the only place bun's isolated store layout guarantees it's reachable from.
const pluginRoot = dirname(import.meta.dir);
const zeroDir = dirname(
  Bun.resolveSync("@rocicorp/zero/package.json", pluginRoot),
);
const pkgJsonPath = Bun.resolveSync(
  "@rocicorp/zero-sqlite3/package.json",
  zeroDir,
);
const pkgDir = dirname(pkgJsonPath);

// The artifact prebuild-install/node-gyp produce — also the path the package's
// own install script probes for idempotency. Present ⇒ already built.
const binary = join(pkgDir, "build", "Release", "better_sqlite3.node");
if (existsSync(binary)) process.exit(0);

const installCmd = JSON.parse(readFileSync(pkgJsonPath, "utf-8")).scripts
  ?.install;
if (typeof installCmd !== "string") {
  throw new Error(
    `ensure-zero-sqlite3: ${pkgJsonPath} has no scripts.install to run`,
  );
}

// Run the package's OWN install command verbatim (so we never drift from
// upstream's build chain) in its dir, with every ancestor node_modules/.bin on
// PATH so prebuild-install/node-gyp resolve — and the ABI pin scoped to THIS
// subprocess only.
const binDirs: string[] = [];
for (let dir = pkgDir; ; ) {
  binDirs.push(join(dir, "node_modules", ".bin"));
  const parent = dirname(dir);
  if (parent === dir) break;
  dir = parent;
}

console.log(`ensure-zero-sqlite3: building ${binary} (Node ${ZERO_SQLITE3_NODE_TARGET} ABI)`);
const result = spawnSync(installCmd, {
  shell: true,
  cwd: pkgDir,
  stdio: "inherit",
  env: {
    ...process.env,
    npm_config_runtime: "node",
    npm_config_target: ZERO_SQLITE3_NODE_TARGET,
    PATH: `${binDirs.join(":")}:${process.env.PATH ?? ""}`,
  },
});

if (result.status !== 0) {
  throw new Error(
    `ensure-zero-sqlite3: build failed (exit ${result.status ?? "signal " + result.signal}) — \`${installCmd}\` in ${pkgDir}`,
  );
}

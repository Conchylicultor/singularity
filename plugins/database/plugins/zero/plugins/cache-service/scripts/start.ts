#!/usr/bin/env bun
/**
 * zero-cache lifecycle script. Invoked by the gateway's generic service
 * supervisor via the "start" command in database.json (gated on the
 * SINGULARITY_ZERO_CACHE opt-in — see boot.ts).
 *
 * Mirrors the embedded/pgbouncer start-script template (binary resolution,
 * idempotent reattach via a port ping, spawnSync, exit 0) with one critical
 * difference: zero-cache CANNOT run under Bun. It needs the native
 * @rocicorp/zero-sqlite3 binary and a Node v22/24 runtime (NOT Node 25, which
 * throws EBADENGINE and breaks Zero's tsx tooling). There is no Node-spawn
 * precedent in the repo, so this script resolves a compatible `node` on PATH
 * and FAILS LOUD if none is found — the host-Node dependency is a Stage-1 risk.
 *
 * Exits 0 on success (zero-cache is running/daemonized), non-zero on failure.
 */
import { existsSync, mkdirSync, openSync } from "node:fs";
import { join, dirname } from "node:path";
import { spawnSync, spawn } from "node:child_process";
import { connect } from "node:net";
import { ZERO_CACHE_PORT } from "@plugins/database/plugins/zero/core";
import {
  ZERO_DIR,
  ZERO_REPLICA_FILE,
  ZERO_UPSTREAM_DB,
} from "../shared";

const READY_TIMEOUT_MS = 60_000;
const ZERO_LOG_FILE = join(ZERO_DIR, "zero-cache.log");

// ─── Node runtime resolution (must be 22 or 24, NOT bun, NOT 25) ────────────

/**
 * Resolve a Node 22/24 executable. zero-cache requires Node >=22 and breaks on
 * Node 25 (EBADENGINE + tsx ERR_MODULE_NOT_FOUND). An explicit override wins;
 * otherwise probe `node` on PATH and validate its major version. Fails loud
 * with a clear, actionable message if no compatible runtime is found.
 */
function resolveNode(): string {
  const candidates: string[] = [];
  const override = process.env.SINGULARITY_ZERO_NODE;
  if (override) candidates.push(override);
  candidates.push("node");

  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ["--version"], { encoding: "utf-8" });
    if (probe.status !== 0 || typeof probe.stdout !== "string") continue;
    const version = probe.stdout.trim(); // e.g. "v22.11.0"
    const major = Number.parseInt(version.replace(/^v/, "").split(".")[0] ?? "", 10);
    if (Number.isNaN(major)) continue;
    if (major === 22 || major === 24) {
      console.log(`zero-cache: using Node ${version} (${candidate})`);
      return candidate;
    }
    console.log(
      `zero-cache: skipping Node ${version} (${candidate}) — need major 22 or 24`,
    );
  }

  throw new Error(
    "zero-cache: no compatible Node runtime found. zero-cache requires Node " +
      "v22 or v24 (NOT Bun, NOT Node 25). Install Node 22/24 and put it on " +
      "PATH, or set SINGULARITY_ZERO_NODE to its absolute path. " +
      `(probed: ${candidates.join(", ")})`,
  );
}

// ─── zero-cache binary resolution ───────────────────────────────────────────

function resolveZeroCacheBin(): string {
  // scripts/ -> cache-service plugin root
  const pluginRoot = dirname(import.meta.dir);
  const bin = join(
    pluginRoot,
    "node_modules",
    "@rocicorp",
    "zero",
    "out",
    "zero",
    "src",
    "cli.js",
  );
  if (!existsSync(bin)) {
    throw new Error(
      `zero-cache: binary not found at ${bin}; run \`bun install\``,
    );
  }
  return bin;
}

// ─── TCP probe ──────────────────────────────────────────────────────────────

function pingPort(timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = connect(ZERO_CACHE_PORT, "127.0.0.1");
    const timer = setTimeout(() => {
      sock.destroy();
      resolve(false);
    }, timeoutMs);
    sock.on("connect", () => {
      clearTimeout(timer);
      sock.destroy();
      resolve(true);
    });
    sock.on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

// ─── main lifecycle ───────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Reattach: if zero-cache is already listening, nothing to do.
  if (await pingPort(1500)) {
    console.log("zero-cache: already running; reattaching");
    return;
  }

  const node = resolveNode();
  const cacheBin = resolveZeroCacheBin();

  mkdirSync(ZERO_DIR, { recursive: true });
  const logFd = openSync(ZERO_LOG_FILE, "a");

  console.log(
    `zero-cache: starting (port=${ZERO_CACHE_PORT}, replica=${ZERO_REPLICA_FILE})`,
  );
  // Detached + unref: zero-cache is a long-lived server, not a daemonizing
  // process like pg_ctl/pgbouncer. The supervisor's watchdog (tcp probe)
  // restarts it on failure, so we fire it off and let the port readiness loop
  // below confirm it came up. stdout/stderr go to the log file.
  const child = spawn(node, [cacheBin], {
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: {
      ...process.env,
      // Stage-1 single-DB dev opt-in: zero-cache's production mode requires
      // --admin-password (throws "missing --admin-password: required in
      // production mode"). Production hardening / admin-password is explicitly
      // deferred to Stage 2; for the Stage-0-proven single-DB dev path we run
      // zero-cache in development mode.
      NODE_ENV: "development",
      ZERO_UPSTREAM_DB,
      ZERO_REPLICA_FILE,
      ZERO_PORT: String(ZERO_CACHE_PORT),
    },
  });
  child.unref();

  // Wait for port readiness.
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await pingPort(500)) {
      console.log("zero-cache: ready");
      return;
    }
    await Bun.sleep(500);
  }
  throw new Error(
    `zero-cache: did not become ready within ${READY_TIMEOUT_MS}ms (see ${ZERO_LOG_FILE})`,
  );
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});

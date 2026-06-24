#!/usr/bin/env bun
/**
 * Per-worktree zero-cache supervisor. Spawned by the gateway's worktree state
 * machine (from the worktree spec's `zeroCache` block — see writeWorktreeSpec /
 * the launcher), NOT by the global database.json service supervisor. The gateway
 * owns this process's lifecycle: it sets cwd + env, tracks the `bun run start.ts`
 * pid, and pgroup-kills it on idle/teardown.
 *
 * Contract — the gateway provides ALL THREE of these env vars (we fail loud if
 * any is missing):
 *   ZERO_UPSTREAM_DB   — upstream DSN (loopback TCP to the worktree's fork DB)
 *   ZERO_PORT          — the gateway-allocated loopback port zero-cache listens on
 *   ZERO_REPLICA_FILE  — abs path to the per-worktree SQLite replica
 *
 * We also derive ZERO_APP_ID from the fork DB name and inject it into the
 * zero-cache child. It is the isolation key that gives each worktree its own
 * replication slot + metadata/CVR/CDC schemas, so concurrent worktree zero-caches
 * on the shared cluster never collide on the cluster-global slot name. See
 * shared/internal/app-id.ts.
 *
 * Process model: this script runs FOREGROUND. It does the clean-slate pre-flight
 * (drop any pre-existing Zero slot/publication + stale replica on the target DB),
 * then spawns the Node zero-cache in the FOREGROUND (not detached) and awaits its
 * exit — so the gateway-tracked pid owns the node child via its process group,
 * exactly like `bun bin/index.ts` owns a backend. Readiness is the gateway's
 * concern now (it probes the port); there is no reattach/daemon logic here.
 *
 * zero-cache CANNOT run under Bun: it needs the @rocicorp/zero-sqlite3 native
 * addon built for an EXACT Node major (ZERO_NODE_MAJOR). We resolve a compatible
 * `node` on PATH and FAIL LOUD if none is found.
 */
import { existsSync } from "node:fs";
import { rm, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { spawnSync, spawn } from "node:child_process";
import { Client } from "pg";
import { SINGULARITY_DIR } from "@plugins/infra/plugins/paths/core";
import { dropZeroSlotsAndPublications } from "../shared/internal/slot-sql";
import { zeroAppId } from "../shared/internal/app-id";
import { ZERO_NODE_MAJOR, zeroNodeCacheDir } from "../shared/internal/node-runtime";

// ─── env contract (gateway-provided; fail loud if absent) ────────────────────

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `zero-cache: ${name} is required (the gateway sets it when spawning the ` +
        `worktree's zeroCache.command). Got: ${value ?? "<unset>"}`,
    );
  }
  return value;
}

const ZERO_UPSTREAM_DB = requireEnv("ZERO_UPSTREAM_DB");
const ZERO_PORT = requireEnv("ZERO_PORT");
const ZERO_REPLICA_FILE = requireEnv("ZERO_REPLICA_FILE");

// The target fork DB name = the last path segment of the upstream DSN. Used for
// the pre-flight slot/publication cleanup DDL.
function dbNameFromDsn(dsn: string): string {
  const name = new URL(dsn).pathname.replace(/^\//, "");
  if (!name) throw new Error(`zero-cache: no database in ZERO_UPSTREAM_DB (${dsn})`);
  return name;
}

// ─── Node runtime resolution (must be ZERO_NODE_MAJOR, NOT bun) ──────────────

/**
 * Resolve a Node executable whose major is exactly ZERO_NODE_MAJOR — the single
 * major the @rocicorp/zero-sqlite3 native addon is built for (see node-runtime.ts).
 * A different major (e.g. 22, with a different ABI) would load that addon with
 * ERR_DLOPEN_FAILED, so we reject it here rather than crash later. Candidate
 * order: an explicit SINGULARITY_ZERO_NODE override wins; then the managed cache
 * provisioned at install time (ensure-zero-node.ts); then `node` on PATH. Each is
 * probed and its major validated. Fails loud with a clear, actionable message if
 * no compatible runtime is found.
 */
function resolveNode(): string {
  const managedNode = join(zeroNodeCacheDir(SINGULARITY_DIR), "bin", "node");

  const candidates: string[] = [];
  const override = process.env.SINGULARITY_ZERO_NODE;
  if (override) candidates.push(override);
  candidates.push(managedNode);
  candidates.push("node");

  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ["--version"], { encoding: "utf-8" });
    if (probe.status !== 0 || typeof probe.stdout !== "string") continue;
    const version = probe.stdout.trim(); // e.g. "v24.17.0"
    const major = Number.parseInt(version.replace(/^v/, "").split(".")[0] ?? "", 10);
    if (Number.isNaN(major)) continue;
    if (major === ZERO_NODE_MAJOR) {
      console.log(`zero-cache: using Node ${version} (${candidate})`);
      return candidate;
    }
    console.log(
      `zero-cache: skipping Node ${version} (${candidate}) — need major ${ZERO_NODE_MAJOR}`,
    );
  }

  throw new Error(
    `zero-cache: no compatible Node runtime found. zero-cache requires Node ` +
      `v${ZERO_NODE_MAJOR} (the major @rocicorp/zero-sqlite3's native addon is ` +
      `built for; NOT Bun). The managed runtime should have been provisioned to ` +
      `${managedNode} by \`bun install\` (ensure-zero-node.ts) — re-run \`bun install\` ` +
      `if it is missing. Otherwise install Node ${ZERO_NODE_MAJOR} and put it on ` +
      `PATH, or set SINGULARITY_ZERO_NODE to its absolute path. ` +
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

// ─── main lifecycle ───────────────────────────────────────────────────────

async function main(): Promise<void> {
  const dbName = dbNameFromDsn(ZERO_UPSTREAM_DB);
  const ZERO_APP_ID = zeroAppId(dbName);

  // Clean-slate pre-flight (the drop-and-recopy semantics): drop any pre-existing
  // Zero slot(s) + publications on the target fork and delete the stale replica,
  // so this start always begins from a deterministic fresh initial COPY. We use
  // our OWN `pg` client over the upstream DSN (not the admin server barrel) so
  // this tools-target script stays off the DOM-typed server import graph — the
  // drop SQL itself is shared verbatim with the reap hook + idle sweep.
  console.log(`zero-cache: cleaning stale Zero slot/replica for ${dbName}`);
  const preflight = new Client({ connectionString: ZERO_UPSTREAM_DB });
  await preflight.connect();
  try {
    await dropZeroSlotsAndPublications(dbName, (text, params) =>
      preflight.query(text, params),
    );
  } finally {
    await preflight.end();
  }
  await rm(ZERO_REPLICA_FILE, { force: true });
  // zqlite opens the replica with the parent dir assumed to exist (it does NOT
  // create it). The per-worktree replica dir (<worktree>/zero/) is fresh on a
  // first cold start, so create it before zero-cache opens the SQLite replica.
  await mkdir(dirname(ZERO_REPLICA_FILE), { recursive: true });

  const node = resolveNode();
  const cacheBin = resolveZeroCacheBin();

  console.log(
    `zero-cache: starting (app=${ZERO_APP_ID}, port=${ZERO_PORT}, replica=${ZERO_REPLICA_FILE}, upstream=${dbName})`,
  );

  // Foreground (NOT detached): the gateway owns this process and pgroup-kills it.
  // Inherit stdio so the gateway captures zero-cache's output in the worktree log.
  const child = spawn(node, [cacheBin], {
    stdio: "inherit",
    env: {
      ...process.env,
      // zero-cache's production mode requires --admin-password; we run dev mode
      // (production hardening is deferred). See the Stage notes.
      NODE_ENV: "development",
      ZERO_UPSTREAM_DB,
      ZERO_REPLICA_FILE,
      ZERO_PORT,
      ZERO_APP_ID,
    },
  });

  const code: number = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (exitCode, signal) => {
      if (signal) {
        console.log(`zero-cache: exited via signal ${signal}`);
        resolve(0);
        return;
      }
      resolve(exitCode ?? 1);
    });
  });
  process.exit(code);
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});

import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { connect } from "node:net";
import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import {
  teardownSelfContainedApp,
  gatewayPidFile,
  isRunning,
} from "@plugins/infra/plugins/launcher/server";
import { _releaseRuns } from "./tables";
import { releaseLog } from "./release-log";
import { previews, previewStateResource } from "./preview-state-resource";

// Never collide with the dev gateway (9000) or the baked release port (9100).
const PREVIEW_PORT_FLOOR = 9101;
// Per-instance embedded-PG TCP port floor. PG binds a loopback TCP listener
// (listen_addresses=127.0.0.1, for Zero logical replication) that would collide
// with the dev cluster's 5433, so each preview gets a free port from here up.
const PREVIEW_PG_PORT_FLOOR = 5500;
// Where preview data roots live. Literal `/tmp` (NOT os.tmpdir(), the long
// /var/folders/... path on macOS): the embedded PG/gateway open Unix sockets under
// this root, capped at 104 bytes, so the prefix must be short.
const PREVIEW_TMP_DIR = "/tmp";
const PREVIEW_DIR_PREFIX = "sgp-";

/**
 * Probe upward from `from` for a free TCP port. Uses a connect attempt: a refused
 * connection means nothing is listening, so the port is free. Skips 9000/9100.
 */
async function pickFreePort(from: number): Promise<number> {
  for (let port = from; port < from + 500; port++) {
    if (port === 9000 || port === 9100) continue;
    const free = await new Promise<boolean>((resolve) => {
      const sock = connect({ host: "127.0.0.1", port });
      sock.once("connect", () => {
        sock.destroy();
        resolve(false); // something is listening → taken
      });
      sock.once("error", () => {
        sock.destroy();
        resolve(true); // connection refused → free
      });
    });
    if (free) return port;
  }
  throw new Error(`No free preview port found from ${from}`);
}

/**
 * Start a local preview of a finished release artifact. Spawns the staged
 * `launch` binary, which self-roots SINGULARITY_DIR under the data dir we hand it
 * and binds its embedded PG to the free `SINGULARITY_PG_PORT` we pick — so the
 * whole stack runs isolated alongside the dev environment. The data root MUST be
 * short because the embedded PG/gateway open Unix sockets under it (104-byte path
 * limit) — `/tmp/sgp-XXXXXX` is short by construction, the canonical mitigation.
 */
export async function startPreview(runId: string): Promise<void> {
  if (previews.get(runId)?.status === "running") return;

  const [run] = await db
    .select({
      composition: _releaseRuns.composition,
      status: _releaseRuns.status,
      artifactPath: _releaseRuns.artifactPath,
    })
    .from(_releaseRuns)
    .where(eq(_releaseRuns.id, runId))
    .limit(1);

  if (!run) throw new Error(`No release run ${runId}`);
  if (run.status !== "succeeded" || !run.artifactPath) {
    throw new Error(`Release ${runId} is not a succeeded artifact`);
  }

  const port = await pickFreePort(PREVIEW_PORT_FLOOR);
  const pgPort = await pickFreePort(PREVIEW_PG_PORT_FLOOR);
  const dataRoot = mkdtempSync(join(PREVIEW_TMP_DIR, PREVIEW_DIR_PREFIX));

  const proc = Bun.spawn([join(run.artifactPath, "launch")], {
    detached: true,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      SINGULARITY_DIR: dataRoot,
      PORT: String(port),
      SINGULARITY_PG_PORT: String(pgPort),
    },
  });

  const url = `http://${run.composition}.localhost:${port}`;
  previews.set(runId, {
    runId,
    pid: proc.pid,
    port,
    pgPort,
    url,
    dataRoot,
    status: "running",
  });
  releaseLog.publish(
    `Preview ${runId} started on ${url} (pg :${pgPort}, data: ${dataRoot})`,
  );
  previewStateResource.notify();

  // Stream the launcher's output into the release log so the UI surfaces preview
  // boot progress / socket errors. Fire-and-forget: the streams close when the
  // detached process exits; failures here must not crash the start handler.
  // eslint-disable-next-line detached-work-safety/no-untracked-detached-work -- long-lived detached-process output pump: I/O-bound for the child's whole lifetime, not main-thread CPU; a bg span would stay open for the process lifetime
  void streamPreviewOutput(runId, proc.stdout, "stdout");
  // eslint-disable-next-line detached-work-safety/no-untracked-detached-work -- long-lived detached-process output pump: I/O-bound for the child's whole lifetime, not main-thread CPU; a bg span would stay open for the process lifetime
  void streamPreviewOutput(runId, proc.stderr, "stderr");
}

async function streamPreviewOutput(
  runId: string,
  stream: ReadableStream<Uint8Array> | null,
  streamType: "stdout" | "stderr",
): Promise<void> {
  if (!stream) return;
  const decoder = new TextDecoder();
  for await (const chunk of stream as unknown as AsyncIterable<Uint8Array>) {
    for (const line of decoder.decode(chunk).split("\n")) {
      if (line) releaseLog.publish(`[preview ${runId}] ${line}`, streamType);
    }
  }
}

/**
 * Whether a preview's stack is still alive, keyed on its LONG-LIVED gateway (the
 * `launch` process exits right after boot, so its pid is useless here). The gateway
 * pidfile is written during boot under the data root; if it's absent the preview is
 * still starting, so treat that as alive (don't reap a booting stack).
 */
function gatewayAlive(dataRoot: string): boolean {
  let raw: string;
  try {
    raw = readFileSync(gatewayPidFile(dataRoot), "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return true;
    throw err;
  }
  const pid = parseInt(raw.split("\n", 1)[0]?.trim() ?? "", 10);
  return Number.isNaN(pid) ? true : isRunning(pid);
}

/**
 * Stop a running preview: tear down its entire self-contained stack (gateway,
 * backend, PgBouncer, embedded PG — all detached into their own sessions, so this
 * goes through the launcher's pidfile-based teardown rather than a process-group
 * kill), remove the data root, and flip the resource to "stopped". Idempotent — a
 * missing or already-dead preview is a no-op.
 */
export async function stopPreview(runId: string): Promise<void> {
  const entry = previews.get(runId);
  if (!entry) return;
  await teardownSelfContainedApp({
    root: entry.dataRoot,
    httpPort: entry.port,
    pgPort: entry.pgPort,
  });
  rmSync(entry.dataRoot, { recursive: true, force: true });
  previews.delete(runId);
  releaseLog.publish(`Preview ${runId} stopped`);
  previewStateResource.notify();
}

/**
 * Reap orphan previews on boot. Two passes:
 *   1. In-memory entries whose gateway died → drop and remove their data dir.
 *   2. Filesystem sweep: any leftover `/tmp/sgp-*` data root NOT backing an active
 *      entry is an orphan stack from a prior backend lifetime (the previews map is
 *      in-memory, so a dev restart leaves running gateways/PG holding ports with no
 *      record). Tear each down via the launcher and remove the dir.
 */
export async function reconcileOrphanPreviews(): Promise<void> {
  let changed = false;
  const activeRoots = new Set<string>();
  for (const [runId, entry] of previews) {
    if (gatewayAlive(entry.dataRoot)) {
      activeRoots.add(entry.dataRoot);
      continue;
    }
    rmSync(entry.dataRoot, { recursive: true, force: true });
    previews.delete(runId);
    changed = true;
  }

  let dirs: string[];
  try {
    dirs = readdirSync(PREVIEW_TMP_DIR).filter((n) =>
      n.startsWith(PREVIEW_DIR_PREFIX),
    );
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") dirs = [];
    else throw err;
  }
  for (const name of dirs) {
    const root = join(PREVIEW_TMP_DIR, name);
    if (activeRoots.has(root)) continue;
    // Ports unknown for an orphan dir — pidfile-based teardown suffices.
    await teardownSelfContainedApp({ root });
    rmSync(root, { recursive: true, force: true });
    releaseLog.publish(`Reaped orphan preview stack at ${root}`);
  }

  if (changed) previewStateResource.notify();
}

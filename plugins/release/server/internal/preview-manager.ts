import { mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { connect } from "node:net";
import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { _releaseRuns } from "./tables";
import { isPidAlive } from "./run-release";
import { releaseLog } from "./release-log";
import { previews, previewStateResource } from "./preview-state-resource";

// Never collide with the dev gateway (9000) or the baked release port (9100).
const PREVIEW_PORT_FLOOR = 9101;

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
 * `launch` binary, which self-roots SINGULARITY_DIR under the data dir we hand
 * it. The data root MUST be short because the embedded PG/gateway open Unix
 * sockets under it (104-byte path limit) — `/tmp/sgp-XXXXXX` is short by
 * construction, the canonical mitigation.
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
  // Literal `/tmp` (NOT os.tmpdir(), which is the long /var/folders/... path on
  // macOS): the embedded PG/gateway open Unix sockets under this root, capped at
  // 104 bytes, so the root must be short. `/tmp/sgp-XXXXXX` is short by design.
  const dataRoot = mkdtempSync("/tmp/sgp-");

  const proc = Bun.spawn([join(run.artifactPath, "launch")], {
    detached: true,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, SINGULARITY_DIR: dataRoot, PORT: String(port) },
  });

  const url = `http://${run.composition}.localhost:${port}`;
  previews.set(runId, {
    runId,
    pid: proc.pid,
    port,
    url,
    dataRoot,
    status: "running",
  });
  releaseLog.publish(`Preview ${runId} started on ${url} (data: ${dataRoot})`);
  previewStateResource.notify();

  // Stream the launcher's output into the release log so the UI surfaces preview
  // boot progress / socket errors. Fire-and-forget: the streams close when the
  // detached process exits; failures here must not crash the start handler.
  void streamPreviewOutput(runId, proc.stdout, "stdout");
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
 * Best-effort kill of whatever process is LISTENing on `port`. The launcher
 * daemonizes its gateway into its OWN session (so it survives the launcher's
 * exit), which means it is NOT in the launcher's process group and a group-kill
 * misses it — leaving an orphan gateway. Killing by port reaches it. lsof is
 * present on macOS/Linux; it exits non-zero (status 1) when nothing matches,
 * which is the expected "nothing to kill" case.
 */
function killListenerOnPort(port: number): void {
  let out: string;
  try {
    out = execFileSync("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"], {
      encoding: "utf8",
    });
  } catch (err) {
    if ((err as { status?: number }).status === 1) return; // no listener
    throw err;
  }
  for (const pid of out.split("\n").filter(Boolean)) {
    try {
      process.kill(Number(pid), "SIGTERM");
    } catch (killErr) {
      if ((killErr as NodeJS.ErrnoException).code !== "ESRCH") throw killErr;
    }
  }
}

/**
 * Stop a running preview: kill the launcher's process group AND the gateway
 * daemon listening on the preview port (which the launcher detaches into its own
 * session — see killListenerOnPort), remove the mkdtemp data root, and flip the
 * resource to "stopped". Idempotent — a missing or already-dead preview is a no-op.
 */
export function stopPreview(runId: string): void {
  const entry = previews.get(runId);
  if (!entry) return;
  if (isPidAlive(entry.pid)) {
    try {
      // Negative pid → signal the whole process group (detached spawn is a group
      // leader), so the launcher's in-group children (e.g. PG) die with it.
      process.kill(-entry.pid, "SIGTERM");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ESRCH") throw err;
    }
  }
  // The gateway is daemonized into its own session, outside the group above.
  killListenerOnPort(entry.port);
  rmSync(entry.dataRoot, { recursive: true, force: true });
  previews.delete(runId);
  releaseLog.publish(`Preview ${runId} stopped`);
  previewStateResource.notify();
}

/**
 * Reap previews whose launcher process died (e.g. across a backend restart, or a
 * crashed launcher). Drops dead entries from the in-memory map and removes their
 * data dirs so no phantom "running" preview survives. Called on boot.
 */
export function reconcileOrphanPreviews(): void {
  let changed = false;
  for (const [runId, entry] of previews) {
    if (!isPidAlive(entry.pid)) {
      rmSync(entry.dataRoot, { recursive: true, force: true });
      previews.delete(runId);
      changed = true;
    }
  }
  if (changed) previewStateResource.notify();
}

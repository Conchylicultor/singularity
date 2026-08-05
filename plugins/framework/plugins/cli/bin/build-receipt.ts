import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { worktreeArtifacts, worktreeDataDir } from "./paths";

/**
 * What became of a build. `running` is written once the build lock is granted;
 * every graceful terminal path rewrites it. There is no `interrupted` on disk —
 * see `resolveReceipt`.
 */
export type BuildReceiptStatus = "running" | "ok" | "failed" | "superseded";

export interface BuildReceipt {
  status: BuildReceiptStatus;
  buildId: string;
  /** The commit this build answers for (HEAD when it took the lock). */
  commit: string | null;
  pid: number;
  startedAt: string;
  /** Set on every graceful terminal path; `null` while running. */
  finishedAt: string | null;
  exitCode: number | null;
  url: string;
  logPath: string;
}

/**
 * The receipt as a READER should see it: the `running` arm splits by whether the
 * process that wrote it still exists.
 *
 * `interrupted` is the whole point of this file. A build killed by SIGKILL (a
 * caller timeout, an OOM) runs no exit handler, so the terminal rewrite never
 * happens — the receipt is simply left at `running` by a process that is gone.
 * That is unforgeable in the right direction: a build cannot *fail* to deploy and
 * leave `ok`, because `ok` is only ever written by the build that reached its own
 * success path.
 */
export type ResolvedReceipt =
  | { kind: "none" }
  | { kind: "running"; receipt: BuildReceipt }
  | { kind: "interrupted"; receipt: BuildReceipt }
  | { kind: "ok"; receipt: BuildReceipt }
  | { kind: "failed"; receipt: BuildReceipt }
  | { kind: "superseded"; receipt: BuildReceipt };

/**
 * Atomic so a reader never sees a torn file — same tmp+rename shape as
 * `build-logs-writer.ts`.
 */
export function writeBuildReceipt(name: string, receipt: BuildReceipt): void {
  const dir = worktreeDataDir(name);
  mkdirSync(dir, { recursive: true });
  const path = worktreeArtifacts.buildStatus(name);
  const tmp = `${path}.tmp.${process.pid}`;
  writeFileSync(tmp, JSON.stringify(receipt, null, 2) + "\n");
  renameSync(tmp, path);
}

/** The raw receipt, or `null` when this worktree has never recorded a build. */
export function readBuildReceipt(name: string): BuildReceipt | null {
  const path = worktreeArtifacts.buildStatus(name);
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  // An unreadable receipt is NOT a legitimate "no build here" answer — absence
  // means something specific in this file's grammar, so degrading to null would
  // report "never built" for a worktree that has. Throw, naming the fix.
  try {
    return JSON.parse(raw) as BuildReceipt;
  } catch (err) {
    throw new Error(
      `The deploy receipt at ${path} is not valid JSON, so this worktree's deploy ` +
        `state cannot be read. Delete the file to reset it; the next build rewrites it.`,
      { cause: err },
    );
  }
}

/** `true` iff a process with this pid exists (any owner). */
function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ESRCH") return false;
    // EPERM means it exists but belongs to another user — still alive.
    if (code === "EPERM") return true;
    throw err;
  }
}

export function resolveReceipt(receipt: BuildReceipt | null): ResolvedReceipt {
  if (receipt === null) return { kind: "none" };
  if (receipt.status === "running") {
    return pidAlive(receipt.pid)
      ? { kind: "running", receipt }
      : { kind: "interrupted", receipt };
  }
  return { kind: receipt.status, receipt };
}

/** Convenience: read + resolve in one call. */
export function resolveBuildReceipt(name: string): ResolvedReceipt {
  return resolveReceipt(readBuildReceipt(name));
}

/**
 * The warning an op prints when the PREVIOUS build in this worktree never
 * completed, or `null` when there is nothing to say. Returned rather than
 * printed so the shape is testable and the caller owns the stream.
 */
export function interruptedPredecessorWarning(resolved: ResolvedReceipt): string | null {
  if (resolved.kind !== "interrupted") return null;
  const { buildId, startedAt, url } = resolved.receipt;
  return (
    `\n⚠  The previous build (${buildId}, started ${startedAt}) never completed — ` +
    `it did NOT deploy.\n   ${url} is still serving whatever was published before it.\n`
  );
}

/**
 * Print that warning, if there is one. Shared by `build`, `check` and `push`:
 * an interrupted build is silent by construction (SIGKILL prints no verdict and
 * sets no exit code the caller can see), so the NEXT op is where it surfaces —
 * and the next op is very often the one about to verify against a stale deploy.
 */
export function reportInterruptedPredecessor(name: string): void {
  const warning = interruptedPredecessorWarning(resolveBuildReceipt(name));
  if (warning !== null) console.warn(warning);
}

import { closeSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backgroundArgv } from "@plugins/packages/plugins/spawn-priority/core";
import type { SpawnOptions, SpawnResult } from "./types";

/**
 * A `spawnExpectOk` child that exited non-zero (or on a signal). Carries the
 * full capture so the caller's error path never has to re-run the command.
 */
export class SpawnFailedError extends Error {
  constructor(
    readonly argv: string[],
    readonly exitCode: number,
    readonly signalCode: string | null,
    readonly stdout: string,
    readonly stderr: string,
  ) {
    const cause = signalCode ? `signal ${signalCode}` : `exit ${exitCode}`;
    const detail = stderr.trim() || stdout.trim();
    super(`Command failed (${cause}): ${argv.join(" ")}${detail ? `\n${detail}` : ""}`);
    this.name = "SpawnFailedError";
  }
}

const decoder = new TextDecoder();

function makeResult(
  exitCode: number,
  signalCode: string | null,
  stdoutBytes: Uint8Array,
  stderrBytes: Uint8Array,
  maxRssBytes: number | undefined,
): SpawnResult {
  let stdoutText: string | undefined;
  let stderrText: string | undefined;
  return {
    exitCode,
    signalCode,
    stdoutBytes,
    stderrBytes,
    resourceUsage: { maxRssBytes },
    get stdout() {
      return (stdoutText ??= decoder.decode(stdoutBytes));
    },
    get stderr() {
      return (stderrText ??= decoder.decode(stderrBytes));
    },
  };
}

/**
 * Run a child to completion, capturing stdout/stderr WITHOUT piped stdio.
 *
 * The child's streams are redirected to temp-file fds (raw numeric fds — a
 * plain kernel dup2, zero JS stream machinery in either direction) and read
 * back after exit. No stream, no pending pull promise, nothing for bun
 * 1.3.13's exit-during-pull race to wedge. stdin, when given, is a whole
 * buffer delivered the same way (a temp file opened for read).
 *
 * A non-zero exit is a RESULT, not an error — callers that treat it as fatal
 * use `spawnExpectOk`. Temp files orphaned by a hard crash are reclaimed by
 * the OS tmpdir sweep (repo convention).
 */
export async function spawnCaptured(argv: string[], opts: SpawnOptions = {}): Promise<SpawnResult> {
  const dir = mkdtempSync(join(tmpdir(), "sg-spawn-"));
  try {
    const outPath = join(dir, "out");
    const errPath = join(dir, "err");
    let inFd: number | undefined;
    let outFd: number | undefined;
    let errFd: number | undefined;
    let proc: ReturnType<typeof Bun.spawn>;
    let exitCode: number;
    try {
      if (opts.stdin !== undefined) {
        const inPath = join(dir, "in");
        writeFileSync(inPath, opts.stdin);
        inFd = openSync(inPath, "r");
      }
      outFd = openSync(outPath, "w");
      errFd = opts.mergeStderr ? outFd : openSync(errPath, "w");
      proc = Bun.spawn(opts.background ? backgroundArgv(argv) : argv, {
        cwd: opts.cwd,
        env: opts.env,
        stdin: inFd ?? "ignore",
        stdout: outFd,
        stderr: errFd,
      });
      exitCode = await proc.exited;
    } finally {
      // Close our copies of the fds regardless of spawn/exit outcome; the
      // child held its own dups. mergeStderr aliases errFd to outFd.
      if (inFd !== undefined) closeSync(inFd);
      if (outFd !== undefined) closeSync(outFd);
      if (errFd !== undefined && errFd !== outFd) closeSync(errFd);
    }
    const stdoutBytes = new Uint8Array(readFileSync(outPath));
    const stderrBytes = opts.mergeStderr ? new Uint8Array(0) : new Uint8Array(readFileSync(errPath));
    // rusage is only populated once the child has exited.
    return makeResult(exitCode, proc.signalCode, stdoutBytes, stderrBytes, proc.resourceUsage()?.maxRSS);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** `spawnCaptured` that THROWS a `SpawnFailedError` on any non-zero exit. */
export async function spawnExpectOk(argv: string[], opts: SpawnOptions = {}): Promise<SpawnResult> {
  const result = await spawnCaptured(argv, opts);
  if (result.exitCode !== 0) {
    throw new SpawnFailedError(argv, result.exitCode, result.signalCode, result.stdout, result.stderr);
  }
  return result;
}

import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { dlopen, ptr } from "bun:ffi";
import { signalOriginNative } from "../../data-dirs";
import type { SignalOrigin } from "../../core";

/**
 * Must match `SO_LAYOUT_VERSION` in `native/signal-origin.c`. The dylib is
 * content-addressed on the `.c` source, so a stale cached build can only ever
 * pair with matching TS — but this is the cheap explicit guard that turns a
 * hypothetical skew into a refused arm instead of a mis-parsed record.
 */
const EXPECTED_LAYOUT_VERSION = 1;

/** Generous: the JSON is ~200 bytes plus one 4 KB path, worst case. */
const SNAPSHOT_BUF_BYTES = 16 * 1024;

/** The `.c` this plugin compiles. Exported so a caller can record WHAT failed to build. */
export const signalOriginSourcePath = join(
  import.meta.dir,
  "..",
  "..",
  "native",
  "signal-origin.c",
);

/**
 * Arming either worked, or it did not and says why.
 *
 * A bare `false` would be an absorbable failure here: the caller's whole job on
 * the unarmed path is to record `{armed:false, reason}` so that the *absence*
 * of attribution is itself on the record — "no sender recorded" must never be
 * confusable with "nobody sent a signal".
 */
export type SignalOriginArmResult =
  { armed: true; libraryPath: string } | { armed: false; reason: string };

interface TapSymbols {
  so_install: (signo: number) => number;
  so_snapshot: (signo: number, buf: unknown, cap: number) => number;
  so_layout_version: () => number;
}

let tap: TapSymbols | null = null;
/** Sticky: once arming has failed, every later call fails the same way without retrying `cc`. */
let armResult: SignalOriginArmResult | null = null;

function disabledByEnv(): boolean {
  // Escape hatch, mirroring SINGULARITY_NO_SPAWN_PRIORITY: one env var turns the
  // whole mechanism off host-wide without touching a build.
  return process.env.SINGULARITY_NO_SIGNAL_ORIGIN === "1";
}

/**
 * Compile the tap once per distinct `.c` content, host-globally.
 *
 * Content-addressed on the source hash, so editing the `.c` rebuilds
 * automatically and concurrent compiles from parallel worktrees are harmless:
 * every one of them produces identical bytes at the identical path, so the
 * tmp+rename (the same atomic-publish idiom as `build-receipt.ts`) means last
 * writer wins with nothing to lose. No lock, no coordination.
 *
 * Deliberately NOT a `provision/` entry: that runner fails loud, so a dev box
 * without command-line tools would stop being able to `bun install`.
 *
 * Steady-state cost is one `existsSync`.
 */
function ensureTapLibrary():
  { ok: true; path: string } | { ok: false; reason: string } {
  let source: Buffer;
  try {
    source = readFileSync(signalOriginSourcePath);
    // Fail-open by contract: an unreadable source (a compiled release ships no
    // `.c`) degrades to "no attribution", it never throws on a startup path.
  } catch (err) {
    return { ok: false, reason: `source unreadable: ${String(err)}` };
  }

  const sha8 = createHash("sha256").update(source).digest("hex").slice(0, 8);
  const ext = process.platform === "darwin" ? "dylib" : "so";
  const target = signalOriginNative.file(
    `signal-origin-${sha8}-${process.arch}.${ext}`,
  );
  if (existsSync(target)) return { ok: true, path: target };

  const cc = process.env.CC ?? "cc";
  const shared = process.platform === "darwin" ? "-dynamiclib" : "-shared";
  const tmp = `${target}.tmp.${process.pid}`;
  try {
    signalOriginNative.ensure();
    // spawnSync buffers natively (no JS streams), so it is outside the
    // exit-during-stream-pull wedge that bans raw async `Bun.spawn`.
    const res = Bun.spawnSync(
      [
        cc,
        "-O2",
        "-fPIC",
        "-std=c11",
        shared,
        "-o",
        tmp,
        signalOriginSourcePath,
      ],
      {
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    if (res.exitCode !== 0) {
      rmSync(tmp, { force: true });
      const stderr = res.stderr
        .toString()
        .trim()
        .split("\n")
        .slice(-3)
        .join(" / ");
      return {
        ok: false,
        reason: `${cc} exited ${res.exitCode}: ${stderr || "(no output)"}`,
      };
    }
    renameSync(tmp, target);
    return { ok: true, path: target };
    // Fail-open by contract: a missing toolchain (ENOENT on `cc`), a read-only
    // home, any compile-time failure degrades to "no attribution" rather than
    // breaking the caller's startup.
  } catch (err) {
    rmSync(tmp, { force: true });
    return { ok: false, reason: `compile failed: ${String(err)}` };
  }
}

/**
 * `dlopen` LAZILY on first arm rather than at module eval — same two reasons as
 * `packages/flock`: this module is reachable from the CLI bootstrap, and a
 * module-eval `dlopen` would break every non-FFI consumer (type-only imports,
 * tooling, docgen).
 */
function loadTap(): { ok: true; path: string } | { ok: false; reason: string } {
  const lib = ensureTapLibrary();
  if (!lib.ok) return lib;
  try {
    const { symbols } = dlopen(lib.path, {
      so_install: { args: ["i32"], returns: "i32" },
      so_snapshot: { args: ["i32", "ptr", "i32"], returns: "i32" },
      so_layout_version: { args: [], returns: "u32" },
    });
    const loaded = symbols as unknown as TapSymbols;
    const version = loaded.so_layout_version();
    if (version !== EXPECTED_LAYOUT_VERSION) {
      return {
        ok: false,
        reason: `layout version ${version}, expected ${EXPECTED_LAYOUT_VERSION}`,
      };
    }
    tap = loaded;
    return { ok: true, path: lib.path };
    // Fail-open by contract: a dlopen/symbol failure on a future OS degrades to
    // "no attribution", it never aborts the caller's startup.
  } catch (err) {
    return { ok: false, reason: `dlopen failed: ${String(err)}` };
  }
}

/**
 * Arm the tap for each signal number in `signos`.
 *
 * ORDERING IS LOAD-BEARING: call this AFTER `process.on(sig, …)` for every
 * signal you pass. Bun installs its own handler lazily, on the first
 * `process.on(sig)`, and does not chain — so arming first would be silently
 * overwritten by Bun and the tap would never see a delivery.
 *
 * Fails open and QUIET. A missing toolchain, a failed compile, a `dlopen`
 * failure, a layout mismatch or a refused `sigaction` all return
 * `{armed:false, reason}` and change nothing about how the process handles
 * signals. Nothing is printed: a banner on every build in a toolchain-less
 * environment would be noise in exactly the transcript this feature exists to
 * keep clean. Recording the reason is the caller's job.
 */
export function armSignalOrigin(signos: number[]): SignalOriginArmResult {
  // A failure is sticky — never re-run `cc` per call. A success is not: a later
  // caller may pass signals the first one did not, and `so_install` is
  // idempotent, so arming more is free.
  if (armResult !== null && !armResult.armed) return armResult;
  if (disabledByEnv()) {
    armResult = {
      armed: false,
      reason: "disabled by SINGULARITY_NO_SIGNAL_ORIGIN=1",
    };
    return armResult;
  }

  const loaded = loadTap();
  if (!loaded.ok) {
    armResult = { armed: false, reason: loaded.reason };
    return armResult;
  }
  const symbols = tap;
  if (symbols === null) {
    armResult = { armed: false, reason: "tap not loaded" };
    return armResult;
  }

  const failed: number[] = [];
  for (const signo of signos) {
    if (symbols.so_install(signo) !== 0) failed.push(signo);
  }
  // All-or-nothing: a partial arm is a slot that silently never fills, which is
  // the failure mode this whole plugin exists to eliminate.
  armResult =
    failed.length === 0
      ? { armed: true, libraryPath: loaded.path }
      : {
          armed: false,
          reason: `so_install refused signal(s) ${failed.join(",")}`,
        };
  return armResult;
}

/**
 * The recorded origin of the last `signo` delivery, or `null` when the tap is
 * not armed or no such signal ever arrived.
 *
 * Synchronous and pure-read: safe to call from a `process.on("exit")` hook,
 * where no async work can run. Pulling from here rather than pushing from the
 * handler is what makes the record survive a signal that arrives while the
 * process is blocked in a synchronous FFI call — the slot is populated for
 * whichever exit path eventually runs.
 */
export function readSignalOrigin(signo: number): SignalOrigin | null {
  if (tap === null || armResult === null || !armResult.armed) return null;
  const buf = new Uint8Array(SNAPSHOT_BUF_BYTES);
  const n = tap.so_snapshot(signo, ptr(buf), buf.length);
  // 0 = nothing recorded for this signal; negative = bad args / seqlock churn /
  // truncation. Both are "no attribution available", which the caller already
  // handles — there is nothing partial to hand back.
  if (n <= 0) return null;
  const json = new TextDecoder().decode(buf.subarray(0, n));
  return JSON.parse(json) as SignalOrigin;
}

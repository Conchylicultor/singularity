import {
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { spawnCaptured } from "@plugins/infra/plugins/spawn/core";
import { REPO_ROOT } from "@plugins/infra/plugins/paths/core";
import type { ExecContext } from "@plugins/infra/plugins/jobs/plugins/supervised-job/core";
import type { DepState } from "../../core";
import {
  mintReady,
  type Dep,
  type DepSource,
  type InstallContext,
  type Ready,
} from "./dep";
import { releaseLock, tryLock, waitLock } from "./lock";
import {
  logTail,
  readInstallState,
  readJson,
  ReadyFileSchema,
  type ReadyFile,
} from "./state";
import {
  currentIdentity,
  defaultStore,
  installPaths,
  type DepStore,
  type InstallPaths,
} from "./store";

export interface EnsureOptions {
  /** Where progress lines go besides the install log (a job's transcript, the terminal). */
  log?: (line: string) => void;
  /** The checkout whose declaration to derive the identity from. Default: this one. */
  root?: string;
  /** Test seam: the cache, lock dirs and host admission. */
  store?: DepStore;
}

/**
 * Make sure `dep` is installed at its current identity, installing it if not,
 * and return the proof.
 *
 * It never runs on a backend's event loop, by type: `exec` is an
 * `ExecContext`, which only a supervised job's run body and a CLI command can
 * produce. A request handler uses `requestDep` instead.
 *
 * Fast path: `ready.json` present → touch `last-used`, return. Slow path: take
 * the host flock of `(id, identity)` (waiting for another installer), re-check,
 * then install into the identity's dir under one background unit of host
 * admission, writing `ready.json` last.
 */
export async function ensureDep<S extends DepSource>(
  dep: Dep<S>,
  exec: ExecContext,
  opts: EnsureOptions = {},
): Promise<Ready<S>> {
  const store = opts.store ?? defaultStore();
  const root = opts.root ?? REPO_ROOT;
  const { identity, inputs } = await currentIdentity(dep, root);
  const paths = installPaths(store, dep.id, identity);
  const say = opts.log ?? (() => {});

  if (isInstalled(dep, paths)) return found(dep, paths, identity);

  const fd = await waitLock(paths.lock, () =>
    say(
      `another process is installing ${dep.id} (${identity}); waiting for it`,
    ),
  );
  try {
    // Whoever held the lock may have just finished this very install.
    if (isInstalled(dep, paths)) return found(dep, paths, identity);
    await install({ dep, store, root, paths, identity, inputs, exec, say });
    return found(dep, paths, identity);
  } finally {
    releaseLock(fd);
  }
}

/** `ready.json` present, and the payload still whole by the kind's own test. */
function isInstalled(dep: Dep<DepSource>, paths: InstallPaths): boolean {
  if (!existsSync(paths.ready)) return false;
  return dep.source.isIntact?.(paths.env) ?? true;
}

function found<S extends DepSource>(
  dep: Dep<S>,
  paths: InstallPaths,
  identity: string,
): Ready<S> {
  writeFileSync(paths.lastUsed, `${new Date().toISOString()}\n`);
  return mintReady(dep, paths.env, identity);
}

/** Write a small JSON file so a reader never sees half of it. */
function writeJsonAtomic(path: string, value: unknown): void {
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tmp, path);
}

/** Total bytes under `dir`, symlinks counted as themselves (never followed). */
export function dirBytes(dir: string): number {
  let total = 0;
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) stack.push(path);
      else total += lstatSync(path).size;
    }
  }
  return total;
}

/** The bytes a log grew by since `from`, as text. */
function readFrom(path: string, from: number): string {
  const size = statSync(path).size;
  if (size <= from) return "";
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.alloc(size - from);
    readSync(fd, buf, 0, buf.length, from);
    return buf.toString("utf8");
  } finally {
    closeSync(fd);
  }
}

async function install(args: {
  dep: Dep<DepSource>;
  store: DepStore;
  root: string;
  paths: InstallPaths;
  identity: string;
  inputs: Readonly<Record<string, string>>;
  exec: ExecContext;
  say: (line: string) => void;
}): Promise<void> {
  const { dep, store, root, paths, identity, inputs, exec, say } = args;
  mkdirSync(paths.root, { recursive: true });
  // A partial payload from an interrupted install, and the last failure, go.
  // A `ready.json` over a payload that is no longer intact goes first, so the
  // identity reads as not installed until this install finishes.
  rmSync(paths.ready, { force: true });
  rmSync(paths.env, { recursive: true, force: true });
  rmSync(paths.failed, { force: true });
  // The install log holds one install: truncated here, written only by this
  // install (its header, then each command's output appended by the child's
  // own shell), removed with its identity dir. That is its whole bound.
  writeFileSync(
    paths.log,
    `installing ${dep.id} (${dep.source.kind}: ${dep.source.label}) at ${identity}\n`,
  );
  writeJsonAtomic(paths.installing, {
    since: new Date().toISOString(),
    pid: process.pid,
  });

  const log = say;
  const run: InstallContext["run"] = async (argv, runOpts) => {
    say(`$ ${argv.join(" ")}`);
    const from = statSync(paths.log).size;
    // The child appends straight to the install log, so `logTail` follows a
    // long install while it runs; `$0` is the log, `$@` the command.
    const result = await spawnCaptured(
      [
        "sh",
        "-c",
        'printf "$ %s\\n" "$*" >>"$0"; "$@" >>"$0" 2>&1',
        paths.log,
        ...argv,
      ],
      runOpts,
    );
    const output = readFrom(paths.log, from);
    for (const line of output.split("\n")) {
      if (line !== "" && !line.startsWith("$ ")) say(line);
    }
    if (result.exitCode !== 0) {
      throw new Error(
        `\`${argv.join(" ")}\` failed (exit ${result.exitCode}${result.timedOut ? ", timed out" : ""}):\n` +
          logTail(paths.log, 30).join("\n"),
      );
    }
  };

  const started = Date.now();
  say(
    `installing ${dep.id} (${dep.source.kind}: ${dep.source.label}) at ${identity}`,
  );
  try {
    await store.admit(() =>
      dep.source.install({ root, dir: paths.env, log, run, exec }),
    );
    if (!existsSync(paths.env)) {
      throw new Error(
        `the ${dep.source.kind} installer finished without creating ${paths.env}`,
      );
    }
    const ready: ReadyFile = {
      identity,
      installedAt: new Date().toISOString(),
      bytes: dirBytes(paths.env),
      inputs: { ...inputs },
    };
    writeJsonAtomic(paths.ready, ready);
    log(
      `installed ${dep.id} in ${Math.round((Date.now() - started) / 1000)} s (${(ready.bytes / 1e6).toFixed(1)} MB)`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    writeJsonAtomic(paths.failed, { message, at: new Date().toISOString() });
    log(`install failed: ${message}`);
    throw err;
  } finally {
    rmSync(paths.installing, { force: true });
  }
}

/** Where `dep` stands at its current identity. Safe on a backend's event loop. */
export async function depState(
  dep: Dep<DepSource>,
  opts: { root?: string; store?: DepStore } = {},
): Promise<DepState> {
  const store = opts.store ?? defaultStore();
  let identity: string;
  try {
    identity = (await currentIdentity(dep, opts.root ?? REPO_ROOT)).identity;
  } catch (err) {
    // The identity cannot be derived (the installer is missing): nothing can
    // be installed until that is fixed, which is a failure, not "absent".
    return {
      kind: "failed",
      message: `cannot derive the identity: ${err instanceof Error ? err.message : String(err)}`,
      at: new Date().toISOString(),
    };
  }
  return readInstallState(
    installPaths(store, dep.id, identity),
    (dir) => dep.source.isIntact?.(dir) ?? true,
  );
}

/** The outcome of {@link removeDep}. */
export type RemoveOutcome =
  { kind: "removed"; bytes: number } | { kind: "absent" } | { kind: "busy" };

/**
 * Remove `dep`'s install at its current identity, back to `absent`. Refuses
 * (`busy`) while any process holds its lock — an install, or the sweep.
 */
export async function removeDep(
  dep: Dep<DepSource>,
  opts: { root?: string; store?: DepStore } = {},
): Promise<RemoveOutcome> {
  const store = opts.store ?? defaultStore();
  const { identity } = await currentIdentity(dep, opts.root ?? REPO_ROOT);
  const paths = installPaths(store, dep.id, identity);
  if (!existsSync(paths.root)) return { kind: "absent" };
  const fd = tryLock(paths.lock);
  if (fd === null) return { kind: "busy" };
  try {
    const bytes = existsSync(paths.ready)
      ? readJson(paths.ready, ReadyFileSchema).bytes
      : 0;
    // Async: this runs on a backend's event loop (the remove endpoint), and a
    // Python env is tens of thousands of files.
    await rm(paths.root, { recursive: true, force: true });
    return { kind: "removed", bytes };
  } finally {
    releaseLock(fd);
  }
}

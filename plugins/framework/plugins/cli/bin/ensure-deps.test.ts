import { afterEach, test, expect } from "bun:test";
import {
  copyFileSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "fs";
import os from "node:os";
import { dirname, join } from "path";
import { acquireBuildLock } from "./build-lock";
import { ensureDeps, type InstallOutcome } from "./ensure-deps";

const STAMP_REL = join("node_modules", ".singularity-deps");
const PROVISION_REGISTRY_REL =
  "plugins/framework/plugins/tooling/plugins/provision/core/provision.generated.ts";

/**
 * Every fingerprinted file gets the SAME pinned mtime, so two fixtures with
 * identical contents have identical dep signatures. That is what lets the
 * under-lock re-check test transplant a donor's stamp into a blocked waiter's
 * checkout mid-call — the only way to plant a matching stamp *after* the call
 * has already decided it needs to install.
 */
const PINNED_MTIME = new Date(1_700_000_000_000);

/**
 * Fixture dirs, swept after each test. The helpers below mint them (several
 * tests need two — see the stamp transplant), so collecting them here keeps each
 * test body about the behavior under test. Sweeping mid-suite is also a passive
 * assertion that `ensureDeps` released the lock: a still-live lock heartbeat
 * would throw ENOENT on the removed directory a few seconds later.
 */
const fixtures: string[] = [];
afterEach(() => {
  for (const dir of fixtures.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function writeAt(path: string, body: string, mtime: Date): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
  utimesSync(path, mtime, mtime);
}

/**
 * Mutate a dep input with a mtime distinct from `PINNED_MTIME`, so the change is
 * visible even when the new body happens to be the same length as the old one.
 */
function touch(path: string, body: string): void {
  writeAt(path, body, new Date(PINNED_MTIME.getTime() + 60_000));
}

/**
 * A minimal checkout: the root workspace manifest, a lockfile, two member
 * workspaces, and the generated provision registry — one of every kind of dep
 * input the signature covers.
 *
 * The workspace glob is `packages/**`, deliberately NOT the real repo's
 * `plugins/**`, for two reasons. It proves `workspaceWalkRoots` genuinely DERIVES
 * its walk roots from the manifest instead of assuming `plugins/` — the property
 * whose absence would be a permanent silent false-fresh. And a `plugins/<name>/…`
 * string literal here would be read as a real plugin reference by the
 * `plugin-refs-resolve` check, which fails on paths that do not resolve. Do not
 * "fix" these back to `plugins/`.
 */
function makeFixture(): string {
  const dir = mkdtempSync(join(os.tmpdir(), "ensure-deps-test-"));
  fixtures.push(dir);
  const pin = (rel: string, body: string) => writeAt(join(dir, rel), body, PINNED_MTIME);
  pin("package.json", JSON.stringify({ workspaces: ["packages/**"] }));
  pin("bun.lock", "lockfile-v0\n");
  pin("packages/alpha/package.json", '{"name":"alpha"}');
  pin("packages/beta/package.json", '{"name":"beta"}');
  pin(PROVISION_REGISTRY_REL, "export const provisionEntries = [];\n");
  return dir;
}

/** An injected installer that records its calls instead of running `bun install`. */
function recordingInstaller(outcome: InstallOutcome = { exitCode: 0 }) {
  let calls = 0;
  return {
    installer: (): Promise<InstallOutcome> => {
      calls += 1;
      return Promise.resolve(outcome);
    },
    calls: () => calls,
  };
}

const silent = () => {};

/**
 * Assert `ensureDeps` ran exactly one install for this checkout, and gave the
 * lock back on the way out — the lock must span the install, not the caller's
 * process, or a `check` would block on a whole concurrent build.
 */
async function expectInstalls(dir: string): Promise<void> {
  const rec = recordingInstaller();
  const result = await ensureDeps({ root: dir, log: silent, installer: rec.installer });
  expect(result.installed).toBe(true);
  expect(rec.calls()).toBe(1);
  expect(lockPresent(dir)).toBe(false);
}

/**
 * Assert `ensureDeps` skipped: no install spawned, nothing reported as installed.
 * Deliberately says nothing about the lock — the caller does, since a released
 * lock leaves no trace.
 */
async function expectSkips(dir: string): Promise<void> {
  const rec = recordingInstaller();
  const result = await ensureDeps({ root: dir, log: silent, installer: rec.installer });
  expect(result.installed).toBe(false);
  expect(rec.calls()).toBe(0);
}

/** Seed a fixture's stamp by running one gated install through the seam. */
async function seeded(): Promise<string> {
  const dir = makeFixture();
  await expectInstalls(dir);
  return dir;
}

/** Catch a rejection's message, or `undefined` if the call resolved. */
async function messageOf(run: Promise<unknown>): Promise<string | undefined> {
  try {
    await run;
    return undefined;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

function lockPresent(root: string): boolean {
  // The lock is a symlink to a `pid-...` target that never exists as a real
  // file, so `existsSync` (which follows links) would report it as absent.
  return !!lstatSync(join(root, ".install.lock"), { throwIfNoEntry: false });
}

test("a matching stamp skips without ever touching the lock", async () => {
  const dir = await seeded();
  // Someone else holds the install lock, with a live pid and a fresh heartbeat.
  // The fast path must not care: a version that took the lock before checking
  // freshness would block here until the wait cap, failing by test timeout.
  // (Asserting the lock file is merely absent afterwards would not do — now that
  // the lock is released before returning, absent cannot tell "never acquired"
  // from "acquired and released".)
  const release = await acquireBuildLock(join(dir, ".install.lock"), { pollMs: 20 });
  try {
    await expectSkips(dir);
  } finally {
    release();
  }
});

test("a second call in the same checkout is a no-op", async () => {
  await expectSkips(await seeded());
});

test("missing stamp installs", async () => {
  const dir = makeFixture();
  // No `node_modules` at all — the ENOENT a fresh checkout always hits.
  expect(lstatSync(join(dir, "node_modules"), { throwIfNoEntry: false })).toBeUndefined();
  await expectInstalls(dir);
  // The install wrote a stamp, so the checkout is now fresh.
  expect(readFileSync(join(dir, STAMP_REL), "utf8")).toContain('"signature"');
});

test("malformed stamp installs", async () => {
  const dir = makeFixture();
  mkdirSync(join(dir, "node_modules"), { recursive: true });
  writeFileSync(join(dir, STAMP_REL), "{ this is not json");
  await expectInstalls(dir);
});

test("stamp of an unexpected shape installs", async () => {
  const dir = makeFixture();
  mkdirSync(join(dir, "node_modules"), { recursive: true });
  writeFileSync(join(dir, STAMP_REL), JSON.stringify({ hello: "world" }));
  await expectInstalls(dir);
});

test("a stamp recording a different bun version installs", async () => {
  const dir = await seeded();
  const stampPath = join(dir, STAMP_REL);
  const stamp = JSON.parse(readFileSync(stampPath, "utf8")) as { bunVersion: string };
  expect(stamp.bunVersion).toBe(Bun.version);
  stamp.bunVersion = "0.0.1-not-this-bun";
  writeFileSync(stampPath, JSON.stringify(stamp));

  await expectInstalls(dir);
});

// Each mutation below is a dep input the signature must notice. They start from
// a seeded (fresh) checkout, so only the mutation can cause the install.
const mutations: [name: string, mutate: (dir: string) => void][] = [
  [
    "touching a workspace package.json",
    (dir) => touch(join(dir, "packages/alpha/package.json"), '{"name":"alpha","deps":{}}'),
  ],
  ["touching bun.lock", (dir) => touch(join(dir, "bun.lock"), "lockfile-v1\n")],
  [
    "adding a workspace package.json",
    (dir) => touch(join(dir, "packages/gamma/package.json"), '{"name":"gamma"}'),
  ],
  [
    "adding a provision/index.ts",
    (dir) =>
      touch(
        join(dir, "packages/alpha/provision/index.ts"),
        "export default async function provision() {}\n",
      ),
  ],
  [
    "regenerating the provision registry",
    (dir) =>
      touch(
        join(dir, PROVISION_REGISTRY_REL),
        "export const provisionEntries = [{ pluginPath: 'alpha' }];\n",
      ),
  ],
];

for (const [name, mutate] of mutations) {
  test(`${name} installs`, async () => {
    const dir = await seeded();
    mutate(dir);
    await expectInstalls(dir);
  });
}

test("a failed install throws, naming the dependency-install phase", async () => {
  const dir = makeFixture();
  const rec = recordingInstaller({ exitCode: 7 });

  const message = await messageOf(
    ensureDeps({ root: dir, log: silent, installer: rec.installer }),
  );

  expect(message).toContain("dependency install FAILED");
  expect(message).toContain("exited 7");
  expect(message).toContain("not the command you asked for");
  expect(message).toContain("clonefileat");
  // No stamp was written, so the next invocation retries rather than trusting a
  // `node_modules` we know is wrong — and the lock came back even on the throw,
  // so a failed install never wedges the next process.
  expect(lstatSync(join(dir, STAMP_REL), { throwIfNoEntry: false })).toBeUndefined();
  expect(lockPresent(dir)).toBe(false);
});

test("an install killed by a signal names the signal, not a bare exit code", async () => {
  const dir = makeFixture();
  const rec = recordingInstaller({ exitCode: 143, signalCode: "SIGTERM" });

  const message = await messageOf(
    ensureDeps({ root: dir, log: silent, installer: rec.installer }),
  );

  expect(message).toContain("killed by SIGTERM");
});

test("the under-lock re-check skips an install the lock holder already did", async () => {
  // A waiter must not blindly install after waiting: the holder it waited on has
  // very likely just done that exact install. Simulated by holding the lock,
  // dropping in a matching stamp, then releasing.
  const donor = await seeded();
  const dir = makeFixture();
  const release = await acquireBuildLock(join(dir, ".install.lock"), { pollMs: 20 });

  const rec = recordingInstaller();
  const pending = ensureDeps({ root: dir, log: silent, installer: rec.installer });

  // The "holder" completes its install while the waiter is blocked on the lock.
  mkdirSync(join(dir, "node_modules"), { recursive: true });
  copyFileSync(join(donor, STAMP_REL), join(dir, STAMP_REL));
  release();

  expect((await pending).installed).toBe(false);
  expect(rec.calls()).toBe(0);
  // The waiter took the lock to re-check, and handed it straight back.
  expect(lockPresent(dir)).toBe(false);
});

test("two installs in one process both run — the lock does not outlive a call", async () => {
  // The real sequence: the CLI bootstrap installs, then `app-artifacts.ts` stage
  // 1 needs another install because a dep input moved in between. If the lock
  // outlived the first call, the second would wait on a lock held by ITSELF
  // until the wedged-holder timeout fired naming its own pid.
  const dir = await seeded(); // install #1
  touch(join(dir, "bun.lock"), "lockfile-v2\n");
  await expectInstalls(dir); // install #2
});

test("a root without a workspaces field is a loud error, never a vacuous pass", async () => {
  // Guards the one failure mode the signature cannot self-detect: a wrong root
  // walks nothing, so the signature would be stable and the checkout would never
  // install again.
  const dir = mkdtempSync(join(os.tmpdir(), "ensure-deps-test-"));
  fixtures.push(dir);
  writeFileSync(join(dir, "package.json"), '{"name":"not-the-repo-root"}');

  const message = await messageOf(
    ensureDeps({ root: dir, log: silent, installer: recordingInstaller().installer }),
  );

  expect(message).toContain('has no "workspaces" array');
});

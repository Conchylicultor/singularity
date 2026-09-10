/**
 * type-check's preparation runs on a Worker thread so the check runner's own
 * thread stays free. The move is only safe if it changes WHERE the work runs and
 * nothing else, so the cases below are:
 *   1. the plan the thread returns is the plan `openPreparation` computes
 *      in-process over the same listing — for a runnable tree and for one that
 *      fails the coverage gate;
 *   2. a throw inside `./prepare` rejects `prepare()` with the thread's own
 *      stack, rather than leaving the runner waiting on a thread that died;
 *   3. a finalize with no run plan behind it is refused loudly.
 *
 * The fixture is a real git repository, because the listing is read out of git.
 */

import { test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { readTreeListing } from "./fingerprint";
import { openPreparation, type Plan, type PrepareInput } from "./prepare";
import { openPrepareThread } from "./prepare-thread";

// Spawning the thread evaluates the TypeScript compiler in it, which is seconds
// on a loaded host — well past bun's 5 s default.
const TIMEOUT_MS = 60_000;

let root = "";

function write(rel: string, content: string): void {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

/** Run one git command in the fixture, failing loudly if it does not. */
async function git(...args: string[]): Promise<void> {
  const proc = Bun.spawn(["git", ...args], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed (exit ${code}): ${await new Response(proc.stderr).text()}`,
    );
  }
}

// One tsc target (`discoverTscTargets` finds a tsconfig under
// plugins/framework/plugins/<name>/) whose include-roots cover both sources.
// The target name is unique to this suite so no warm base in the host-global
// pool is ever materialized into the fixture.
//
// Spelled as the directory `discoverTscTargets` scans plus the fixture's name,
// never as one `plugins/...` literal: this plugin exists only inside the
// throwaway repo, and a whole-path literal reads to `plugin-refs-resolve` as a
// reference to a plugin of THIS repo that does not exist.
const TARGETS_DIR = "plugins/framework/plugins";
const TARGET = "prepare-thread-fixture";
const TARGET_DIR = `${TARGETS_DIR}/${TARGET}`;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "type-check-prepare-thread-"));
  write(
    `${TARGET_DIR}/tsconfig.json`,
    JSON.stringify({ compilerOptions: { strict: true }, include: ["src"] }),
  );
  write(`${TARGET_DIR}/src/a.ts`, "export const a = 1;\n");
  write(
    `${TARGET_DIR}/src/b.ts`,
    'import { a } from "./a";\nexport const b = a + 1;\n',
  );
  write("package.json", JSON.stringify({ name: "fixture" }));
  await git("init", "-q");
  // So the host user's own global ignores cannot decide what the fixture holds.
  await git("config", "core.excludesFile", "/dev/null");
});

afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

/** The one field that is a measurement, not a decision, zeroed for comparison. */
function decisions(plan: Plan): Plan {
  return plan.kind === "run" ? { ...plan, keysMs: 0 } : plan;
}

async function input(): Promise<PrepareInput> {
  return { listing: await readTreeListing(root), cacheEnabled: true };
}

/**
 * Await `p` and return the Error it rejected with; throw if it resolved or
 * rejected with a non-Error. (`expect(p).rejects.toThrow()` is typed `void`
 * under bun:test, so awaiting it trips `await-thenable`.)
 */
async function rejection(p: Promise<unknown>): Promise<Error> {
  try {
    await p;
  } catch (err) {
    if (err instanceof Error) return err;
    throw new Error(`expected an Error rejection, got ${String(err)}`);
  }
  throw new Error("expected the promise to reject, but it resolved");
}

test(
  "the thread's plan is the plan computed in-process",
  async () => {
    const thread = openPrepareThread();
    try {
      const fromThread = await thread.prepare(await input());
      const inProcess = openPreparation(await input()).plan;
      expect(decisions(fromThread)).toEqual(decisions(inProcess));
      // Not a vacuous equality: the fixture is a runnable, unkeyed cold target.
      expect(decisions(fromThread)).toEqual({
        kind: "run",
        targets: [
          {
            name: TARGET,
            tsconfigPath: join(root, TARGET_DIR, "tsconfig.json"),
          },
        ],
        toRun: [TARGET],
        lintByTarget: {
          [TARGET]: [
            join(root, TARGET_DIR, "src/a.ts"),
            join(root, TARGET_DIR, "src/b.ts"),
          ],
        },
        skipped: [],
        unkeyed: [`${TARGET}: no buildinfo yet`],
        keysMs: 0,
      });
    } finally {
      thread.close();
    }
  },
  TIMEOUT_MS,
);

test(
  "a coverage-gate failure crosses the thread as the same plan",
  async () => {
    // Outside the tsconfig include and imported by nothing: no program owns it.
    write(`${TARGET_DIR}/stray.ts`, "export const stray = 1;\n");
    const thread = openPrepareThread();
    try {
      const fromThread = await thread.prepare(await input());
      expect(fromThread).toEqual(openPreparation(await input()).plan);
      expect(fromThread).toEqual({
        kind: "uncovered",
        uncovered: [`${TARGET_DIR}/stray.ts`],
      });
    } finally {
      thread.close();
      rmSync(join(root, TARGET_DIR, "stray.ts"), { force: true });
    }
  },
  TIMEOUT_MS,
);

test(
  "a throw inside prepare rejects prepare() with the thread's own stack",
  async () => {
    const thread = openPrepareThread();
    try {
      // A root with no plugins/ tree: target discovery's readdir throws inside
      // `./prepare`, on the thread.
      const err = await rejection(
        thread.prepare({
          listing: { root: join(root, "no-such-checkout"), files: [] },
          cacheEnabled: true,
        }),
      );
      expect(err.message).toContain("no-such-checkout");
      // A frame from inside `./prepare` — only the thread's own stack has one.
      expect(err.stack).toContain("openPreparation");
    } finally {
      thread.close();
    }
  },
  TIMEOUT_MS,
);

test(
  "finalize with no run plan behind it is refused",
  async () => {
    const thread = openPrepareThread();
    try {
      expect((await rejection(thread.finalize([]))).message).toContain(
        "finalize with no run plan",
      );
    } finally {
      thread.close();
    }
  },
  TIMEOUT_MS,
);

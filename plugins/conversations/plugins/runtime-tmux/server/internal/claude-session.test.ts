import { describe, expect, test } from "bun:test";
import { resolveSessionState, type SessionFileDeps } from "./claude-session";
import { captureProcessTree, type ProcessTree } from "./process-tree";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-07-09T12:00:00Z");

interface Entry {
  json: Record<string, unknown>;
  mtimeMs: number;
}

/** Session files keyed by pid; a pid with no entry behaves as ENOENT. */
function depsOf(files: Record<number, Entry>): SessionFileDeps {
  return {
    readSessionFile: (pid) => {
      const entry = files[pid];
      return Promise.resolve(entry ? JSON.stringify(entry.json) : null);
    },
    statSessionFile: (pid) => Promise.resolve(files[pid]?.mtimeMs ?? null),
    listSessionPids: () => Promise.resolve(Object.keys(files).map(Number)),
  };
}

function chain(...pids: number[]): ProcessTree {
  const children = new Map<number, number[]>();
  for (let i = 1; i < pids.length; i++) children.set(pids[i - 1]!, [pids[i]!]);
  return { children };
}

/**
 * Await a promise expected to reject and hand back its Error.
 *
 * `expect(p).rejects.toThrow()` is typed `void` by bun's matchers even though it
 * returns a promise, so awaiting it trips `@typescript-eslint/await-thenable`.
 * Capturing the rejection directly is honest to the types, and a promise that
 * resolves fails loudly here rather than passing a vacuous assertion.
 */
async function rejection(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof Error) return err;
    throw err;
  }
  throw new Error("expected the promise to reject, but it resolved");
}

describe("resolveSessionState", () => {
  test("healthy pane: the root's own session file wins however old it is", async () => {
    // 22 of 23 live sessions look like this. An idle interactive session can go
    // weeks without a write, so age alone must never disqualify a candidate —
    // only membership in the pane's subtree, and mtime *within* it, decide.
    const deps = depsOf({
      99082: {
        json: { sessionId: "4a4671db", status: "idle", waitingFor: null },
        mtimeMs: NOW - 58 * DAY_MS,
      },
    });
    const state = await resolveSessionState(99082, chain(99082), deps);
    expect(state).toEqual({
      sessionId: "4a4671db",
      status: "idle",
      waitingFor: null,
    });
  });

  test("relocated session: the fresh leaf beats the launcher's tombstone", async () => {
    // launcher → daemon run → --bg-pty-host → the real agent.
    const tree = chain(99082, 5302, 5330, 5414);
    const deps = depsOf({
      99082: {
        json: { sessionId: "4a4671db", status: "idle" },
        mtimeMs: NOW - 12 * 60 * 60 * 1000,
      },
      5414: {
        json: { sessionId: "af01a393", status: "busy" },
        mtimeMs: NOW - 60 * 1000,
      },
    });
    const state = await resolveSessionState(99082, tree, deps);
    expect(state).toEqual({
      sessionId: "af01a393",
      status: "busy",
      waitingFor: null,
    });
  });

  test("pids outside the pane's subtree are never considered", async () => {
    const tree: ProcessTree = { children: new Map([[1, [2]]]) };
    const deps = depsOf({
      2: { json: { sessionId: "mine", status: "idle" }, mtimeMs: NOW - DAY_MS },
      777: {
        json: { sessionId: "someone-elses", status: "busy" },
        mtimeMs: NOW,
      },
    });
    expect((await resolveSessionState(1, tree, deps)).sessionId).toBe("mine");
  });

  test("identical mtimes resolve to the deepest pid", async () => {
    const tree = chain(1, 2);
    const deps = depsOf({
      1: { json: { sessionId: "launcher" }, mtimeMs: NOW },
      2: { json: { sessionId: "daemon" }, mtimeMs: NOW },
    });
    expect((await resolveSessionState(1, tree, deps)).sessionId).toBe("daemon");
  });

  test("a file without a sessionId is not a candidate", async () => {
    const deps = depsOf({ 1: { json: { status: "idle" }, mtimeMs: NOW } });
    const state = await resolveSessionState(1, chain(1), deps);
    expect(state).toEqual({ sessionId: null, status: null, waitingFor: null });
  });

  test("no session file anywhere in the subtree yields the null state", async () => {
    // Legitimate: Claude has not written ~/.claude/sessions/<pid>.json yet.
    const state = await resolveSessionState(1, chain(1, 2, 3), depsOf({}));
    expect(state).toEqual({ sessionId: null, status: null, waitingFor: null });
  });

  test("an unknown CLI status is a hard error", async () => {
    const deps = depsOf({
      1: { json: { sessionId: "abc", status: "compacting" }, mtimeMs: NOW },
    });
    const err = await rejection(resolveSessionState(1, chain(1), deps));
    expect(err.message).toMatch(
      /Unknown Claude CLI session status "compacting"/,
    );
  });

  test("a non-ENOENT read failure propagates", async () => {
    const deps: SessionFileDeps = {
      readSessionFile: () => Promise.reject(new Error("EACCES")),
      statSessionFile: () => Promise.resolve(NOW),
      listSessionPids: () => Promise.resolve([]),
    };
    const err = await rejection(resolveSessionState(1, chain(1), deps));
    expect(err.message).toContain("EACCES");
  });

  test("a failing process lister propagates instead of resolving against an empty tree", async () => {
    const err = await rejection(
      captureProcessTree(() => Promise.reject(new Error("ps failed"))).then(
        (tree) => resolveSessionState(1, tree, depsOf({})),
      ),
    );
    expect(err.message).toContain("ps failed");
  });
});

describe("resolveSessionState — parked background jobs", () => {
  // Claude Code can park a pane's session as a background job: it forks the
  // conversation to a new session id, hands it to a --bg-pty-host process that
  // launchd re-parents, and leaves a stub in the pane. The stub's file stops
  // being written and still names the PRE-fork id, so subtree + mtime alone
  // pin the conversation to a transcript that never grows again — the real
  // 2026-08-18 incident (10h of turns written where the UI could not read them).
  test("the pane follows its parked pointer to the job actually running", async () => {
    const deps = depsOf({
      9948: {
        json: {
          sessionId: "9fd24c8e",
          status: "idle",
          parkedJobId: "baf9c302",
        },
        mtimeMs: NOW - 10 * 60 * 60 * 1000,
      },
      // Outside the pane's subtree entirely: its host is re-parented to launchd.
      11536: {
        json: { sessionId: "baf9c302-68bf", status: "busy", jobId: "baf9c302" },
        mtimeMs: NOW - 60 * 1000,
      },
    });
    const state = await resolveSessionState(9948, chain(9948), deps);
    expect(state).toEqual({
      sessionId: "baf9c302-68bf",
      status: "busy",
      waitingFor: null,
    });
  });

  test("the pointer wins even when the stub's own file is the fresher one", async () => {
    // The stub is stale BY CONSTRUCTION — it stopped writing when it parked —
    // so freshness must not get a vote here, or a stub touched by anything
    // (a status flap, a resize) would take the pane back to the dead id.
    const deps = depsOf({
      1: {
        json: { sessionId: "stub", status: "idle", parkedJobId: "job-1" },
        mtimeMs: NOW,
      },
      2: {
        json: { sessionId: "live", status: "busy", jobId: "job-1" },
        mtimeMs: NOW - 5 * 60 * 1000,
      },
    });
    expect((await resolveSessionState(1, chain(1), deps)).sessionId).toBe(
      "live",
    );
  });

  test("a parked job that has exited leaves the pane on its own id", async () => {
    // Nothing claims the job, so the stub's id is the best we have — which is
    // exactly the pre-park behaviour, not a new failure.
    const deps = depsOf({
      1: {
        json: { sessionId: "stub", status: "idle", parkedJobId: "job-gone" },
        mtimeMs: NOW,
      },
    });
    const state = await resolveSessionState(1, chain(1), deps);
    expect(state).toEqual({
      sessionId: "stub",
      status: "idle",
      waitingFor: null,
    });
  });

  test("a job that parked again is followed to the end of the chain", async () => {
    const deps = depsOf({
      1: { json: { sessionId: "stub", parkedJobId: "job-1" }, mtimeMs: NOW },
      2: {
        json: { sessionId: "middle", jobId: "job-1", parkedJobId: "job-2" },
        mtimeMs: NOW,
      },
      3: {
        json: { sessionId: "last", status: "busy", jobId: "job-2" },
        mtimeMs: NOW,
      },
    });
    expect((await resolveSessionState(1, chain(1), deps)).sessionId).toBe(
      "last",
    );
  });

  test("a pointer cycle terminates instead of spinning", async () => {
    const deps = depsOf({
      1: { json: { sessionId: "stub", parkedJobId: "job-a" }, mtimeMs: NOW },
      2: {
        json: { sessionId: "a", jobId: "job-a", parkedJobId: "job-b" },
        mtimeMs: NOW,
      },
      3: {
        json: { sessionId: "b", jobId: "job-b", parkedJobId: "job-a" },
        mtimeMs: NOW,
      },
    });
    expect((await resolveSessionState(1, chain(1), deps)).sessionId).toBe("b");
  });

  test("a host claiming the job but naming no session is not adopted", async () => {
    const deps = depsOf({
      1: { json: { sessionId: "stub", parkedJobId: "job-1" }, mtimeMs: NOW },
      2: { json: { jobId: "job-1", status: "busy" }, mtimeMs: NOW },
    });
    expect((await resolveSessionState(1, chain(1), deps)).sessionId).toBe(
      "stub",
    );
  });

  test("an unparked pane never lists the sessions directory", async () => {
    // The scan is the cost this pointer hop adds; it must stay off the path of
    // the panes that never park (22 of 23 in the wild).
    let listed = 0;
    const base = depsOf({ 1: { json: { sessionId: "solo" }, mtimeMs: NOW } });
    const deps: SessionFileDeps = {
      ...base,
      listSessionPids: () => {
        listed++;
        return base.listSessionPids();
      },
    };
    await resolveSessionState(1, chain(1), deps);
    expect(listed).toBe(0);
  });
});

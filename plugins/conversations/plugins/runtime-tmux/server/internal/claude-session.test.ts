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
    expect(state).toEqual({ sessionId: "4a4671db", status: "idle", waitingFor: null });
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
    expect(state).toEqual({ sessionId: "af01a393", status: "busy", waitingFor: null });
  });

  test("pids outside the pane's subtree are never considered", async () => {
    const tree: ProcessTree = { children: new Map([[1, [2]]]) };
    const deps = depsOf({
      2: { json: { sessionId: "mine", status: "idle" }, mtimeMs: NOW - DAY_MS },
      777: { json: { sessionId: "someone-elses", status: "busy" }, mtimeMs: NOW },
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
    expect(err.message).toMatch(/Unknown Claude CLI session status "compacting"/);
  });

  test("a non-ENOENT read failure propagates", async () => {
    const deps: SessionFileDeps = {
      readSessionFile: () => Promise.reject(new Error("EACCES")),
      statSessionFile: () => Promise.resolve(NOW),
    };
    const err = await rejection(resolveSessionState(1, chain(1), deps));
    expect(err.message).toContain("EACCES");
  });

  test("a failing process lister propagates instead of resolving against an empty tree", async () => {
    const err = await rejection(
      captureProcessTree(() => Promise.reject(new Error("ps failed"))).then((tree) =>
        resolveSessionState(1, tree, depsOf({})),
      ),
    );
    expect(err.message).toContain("ps failed");
  });
});

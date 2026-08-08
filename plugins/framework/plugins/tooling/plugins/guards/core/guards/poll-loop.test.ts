import { afterEach, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createContext } from "../context";
import type { Verdict } from "../types";
import { pollLoopGuard } from "./poll-loop";

const TASK =
  "/private/tmp/claude-501/-Users-x--worktrees-att-1/abc/tasks/bjr1kagwr.output";
/** A pid high enough that it cannot be live — drives the "finished" arm. */
const DEAD_PID = 2_147_483_646;

const sessions: string[] = [];
let counter = 0;

/** A fresh session id per case, so state never leaks between tests. */
function newSession(): string {
  const id = `guard-test-${process.pid}-${counter++}`;
  sessions.push(id);
  return id;
}

function run(session: string, command: string): Verdict {
  return pollLoopGuard.check(
    { command },
    createContext("/tmp", session),
  ) as Verdict;
}

/** Run a sequence and return the verdict of the last call. */
function runAll(commands: string[]): Verdict {
  const session = newSession();
  let last: Verdict = { kind: "allow" };
  for (const c of commands) last = run(session, c);
  return last;
}

afterEach(() => {
  for (const id of sessions.splice(0)) {
    rmSync(join(tmpdir(), `guard-poll-loop-${id}.json`), { force: true });
  }
});

describe("poll-loop guard", () => {
  describe("the loop from conv-1786116592-b70n", () => {
    const polls = [25, 30, 35, 40].map(
      (n) =>
        `cat ${TASK} 2>/dev/null | tail -${n}; pgrep -f "singularity push" >/dev/null && echo running || echo finished`,
    );

    test("the first three looks are allowed", () => {
      const session = newSession();
      for (const p of polls.slice(0, 3))
        expect(run(session, p).kind).toBe("allow");
    });

    test("the fourth is denied even though every command differs", () => {
      expect(runAll(polls).kind).toBe("deny");
    });

    test("the denial tells the agent it will be notified", () => {
      const v = runAll(polls);
      expect(v.kind === "deny" && v.reason).toContain("re-invoked");
    });
  });

  describe("what resets and what does not", () => {
    test("doing real work in between clears the window", () => {
      const session = newSession();
      run(session, `cat ${TASK}`);
      run(session, `cat ${TASK}`);
      run(session, `cat ${TASK}`);
      run(session, "./singularity build");
      expect(run(session, `cat ${TASK}`).kind).toBe("allow");
    });

    test("an unrelated read-only command does not clear it", () => {
      expect(
        runAll([
          `cat ${TASK}`,
          "uptime",
          `cat ${TASK}`,
          "ls -la src",
          `cat ${TASK}`,
          `cat ${TASK}`,
        ]).kind,
      ).toBe("deny");
    });

    test("watching different things never accumulates", () => {
      expect(
        runAll([
          "cat /x/tasks/aaaaaaaaa.output",
          "cat /x/tasks/bbbbbbbbb.output",
          "cat /x/tasks/ccccccccc.output",
          "cat /x/tasks/ddddddddd.output",
        ]).kind,
      ).toBe("allow");
    });
  });

  describe("liveness picks the arm", () => {
    test("a live process is a wait — denied, told to end the turn", () => {
      const live = `ps -p ${process.pid} -o etime=`;
      const v = runAll([live, live, live, live]);
      expect(v.kind === "deny" && v.reason).toContain("END YOUR TURN");
    });

    test("a finished process is forensics — allowed, with the fact attached", () => {
      const dead = `ps -p ${DEAD_PID} -o etime=`;
      const v = runAll([dead, dead, dead, dead]);
      expect(v.kind).toBe("inform");
      expect(v.kind === "inform" && v.context).toContain("finished");
    });
  });

  describe("escalation", () => {
    test("a second loop on the same subject ends the turn", () => {
      const session = newSession();
      const poll = `cat ${TASK}`;
      for (let i = 0; i < 4; i++) run(session, poll);
      // Denied once; ignoring that and polling the same subject again escalates.
      for (let i = 0; i < 3; i++) run(session, poll);
      const v = run(session, poll);
      expect(v.kind === "deny" && v.fatal).toBe(true);
    });
  });

  describe("ordinary commands are untouched", () => {
    test("a command watching nothing", () => {
      expect(
        runAll(["ls -la src", "ls -la src", "ls -la src", "ls -la src"]).kind,
      ).toBe("allow");
    });
  });
});

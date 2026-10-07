import { describe, expect, test } from "bun:test";
import type { FileChangeEvent } from "@plugins/infra/plugins/file-watcher/server";
import {
  notifySessionTranscriptWrites,
  onSessionTranscriptWritten,
  writtenSessionIds,
} from "./session-writes";

const PROJECTS = "/home/u/.claude/projects";
const A = "ab5453b8-7de7-4fb3-8b87-249a2f3b5613";
const B = "27cbf65a-fb05-413f-b322-5b377a75bb26";

function ev(type: FileChangeEvent["type"], path: string): FileChangeEvent {
  return { type, path };
}

describe("writtenSessionIds", () => {
  test("names top-level session transcripts created or appended to", () => {
    const ids = writtenSessionIds(
      [
        ev("create", `${PROJECTS}/-wt-a/${A}.jsonl`),
        ev("update", `${PROJECTS}/-wt-b/${B}.jsonl`),
        ev("update", `${PROJECTS}/-wt-a/${A}.jsonl`),
      ],
      PROJECTS,
    );
    expect([...ids].sort()).toEqual([A, B].sort());
  });

  test("ignores deletions, sub-agent files and non-session names", () => {
    const ids = writtenSessionIds(
      [
        ev("delete", `${PROJECTS}/-wt-a/${A}.jsonl`),
        ev("create", `${PROJECTS}/-wt-a/${A}/subagents/agent-1.jsonl`),
        ev("create", `${PROJECTS}/-wt-a/notes.jsonl`),
        ev("create", `/elsewhere/-wt-a/${B}.jsonl`),
      ],
      PROJECTS,
    );
    expect(ids.size).toBe(0);
  });
});

describe("onSessionTranscriptWritten", () => {
  test("a batch reaches every listener once, until it unsubscribes", () => {
    const heard: string[][] = [];
    const off = onSessionTranscriptWritten((ids) => heard.push([...ids]));
    notifySessionTranscriptWrites(
      [
        ev("create", `${PROJECTS}/-wt-a/${A}.jsonl`),
        ev("update", `${PROJECTS}/-wt-a/${A}.jsonl`),
      ],
      PROJECTS,
    );
    // A batch touching no session is not delivered at all.
    notifySessionTranscriptWrites([], PROJECTS);
    off();
    notifySessionTranscriptWrites(
      [ev("create", `${PROJECTS}/-wt-b/${B}.jsonl`)],
      PROJECTS,
    );
    expect(heard).toEqual([[A]]);
  });
});

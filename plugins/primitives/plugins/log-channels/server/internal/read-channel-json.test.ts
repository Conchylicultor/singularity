import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { WORKTREES_DIR } from "@plugins/infra/plugins/paths/server";
import { appendEntryToDir, logsDirFor, readChannelJson } from "./persist";

// Hermetic: a throwaway worktree name under the real SINGULARITY_DIR (mirrors
// host-semaphore's test precedent), removed in afterEach. We write real
// log-channel envelope lines with appendEntryToDir so the read path is exercised
// end-to-end (envelope unwrap + inner JSON.parse + safeParse).

const CHANNEL = "sample";
const Schema = z.object({ n: z.number() });

let worktree: string;

beforeEach(() => {
  worktree = `read-channel-json-test-${process.pid}-${Math.random().toString(36).slice(2)}`;
});

afterEach(() => {
  rmSync(join(WORKTREES_DIR, worktree), { recursive: true, force: true });
});

function envelope(line: string): { t: number; stream: "stdout"; line: string } {
  return { t: Date.now(), stream: "stdout", line };
}

describe("readChannelJson", () => {
  test("unwraps the envelope and returns schema-valid payloads", () => {
    const dir = logsDirFor(worktree);
    appendEntryToDir(dir, CHANNEL, envelope(JSON.stringify({ n: 1 })));
    appendEntryToDir(dir, CHANNEL, envelope(JSON.stringify({ n: 2 })));
    expect(readChannelJson(worktree, CHANNEL, 100, Schema)).toEqual([{ n: 1 }, { n: 2 }]);
  });

  test("drops a torn inner-JSON line and keeps the rest", () => {
    const dir = logsDirFor(worktree);
    appendEntryToDir(dir, CHANNEL, envelope(JSON.stringify({ n: 1 })));
    // A payload that is not valid JSON (a half-flushed inner append).
    appendEntryToDir(dir, CHANNEL, envelope('{"n":'));
    appendEntryToDir(dir, CHANNEL, envelope(JSON.stringify({ n: 3 })));
    expect(readChannelJson(worktree, CHANNEL, 100, Schema)).toEqual([{ n: 1 }, { n: 3 }]);
  });

  test("drops schema-invalid payloads (old shape / wrong type)", () => {
    const dir = logsDirFor(worktree);
    appendEntryToDir(dir, CHANNEL, envelope(JSON.stringify({ n: 1 })));
    appendEntryToDir(dir, CHANNEL, envelope(JSON.stringify({ n: "not-a-number" })));
    appendEntryToDir(dir, CHANNEL, envelope(JSON.stringify({ other: true })));
    expect(readChannelJson(worktree, CHANNEL, 100, Schema)).toEqual([{ n: 1 }]);
  });

  test("missing channel collapses to []", () => {
    expect(readChannelJson(worktree, "never-written", 100, Schema)).toEqual([]);
  });
});

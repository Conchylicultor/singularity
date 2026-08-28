import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  _setLatchDirForTests,
  clearDuress,
  setDuress,
} from "@plugins/infra/plugins/duress/plugins/latch/server";
import { worktreesDir } from "@plugins/infra/plugins/paths/server";
import { readChannelEntries } from "./persist";
import { getChannelIds } from "./registry";
import { handleEmit } from "./handle-emit";

// Hermetic in the two ways that matter: a throwaway worktree name under the real
// SINGULARITY_DIR (the precedent read-channel-json.test.ts sets), removed at the
// end; and the duress latch pointed at a temp dir of its own, so the test can
// never read — or write — the host's real latch.

const ORIGINAL_WORKTREE = process.env.SINGULARITY_WORKTREE;
const worktree = `handle-emit-test-${process.pid}-${Math.random().toString(36).slice(2)}`;
let latchDir: string;
let channelSeq = 0;

beforeAll(() => {
  // The write path resolves the per-worktree logs dir from this env var.
  process.env.SINGULARITY_WORKTREE = worktree;
  latchDir = mkdtempSync(join(tmpdir(), "handle-emit-latch-"));
  _setLatchDirForTests(latchDir);
});

afterAll(() => {
  clearDuress();
  _setLatchDirForTests(null);
  rmSync(latchDir, { recursive: true, force: true });
  rmSync(join(worktreesDir(), worktree), { recursive: true, force: true });
  if (ORIGINAL_WORKTREE === undefined) delete process.env.SINGULARITY_WORKTREE;
  else process.env.SINGULARITY_WORKTREE = ORIGINAL_WORKTREE;
});

beforeEach(() => {
  clearDuress();
});

/** A fresh browser-supplied channel id per test — the registry is process-global. */
function nextChannel(): string {
  channelSeq += 1;
  return `emit-probe-${channelSeq}`;
}

function emitRequest(channel: string, lines: string[]): Request {
  return new Request("http://localhost/api/logs/emit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      channel,
      lines: lines.map((line) => ({ line, t: Date.now() })),
    }),
  });
}

describe("POST /api/logs/emit", () => {
  test("ingests the batch when the host is healthy", async () => {
    const channel = nextChannel();
    const res = await handleEmit(emitRequest(channel, ["a", "b", "c"]), {});

    expect(res.status).toBe(204);
    expect(getChannelIds()).toContain(channel);
    expect(
      readChannelEntries(worktree, channel, 10)?.map((e) => e.line),
    ).toEqual(["a", "b", "c"]);
  });

  test("rejects with 429 while the duress latch is set, touching nothing", async () => {
    const channel = nextChannel();
    setDuress("test");
    const res = await handleEmit(emitRequest(channel, ["dropped"]), {});

    // 429 is asserted as a LITERAL on purpose. The client-side endpoint-error
    // reporter files a crash report for every `status >= 500`, so a 503 here would
    // turn each rejected POST into a "server error" report during duress — a
    // report storm caused by the storm-suppression mechanism itself.
    expect(res.status).toBe(429);
    // Nothing downstream ran: no channel opened, nothing on disk.
    expect(getChannelIds()).not.toContain(channel);
    expect(readChannelEntries(worktree, channel, 10)).toBeNull();
  });

  test("resumes ingesting once the latch clears", async () => {
    const channel = nextChannel();
    setDuress("test");
    expect((await handleEmit(emitRequest(channel, ["x"]), {})).status).toBe(
      429,
    );

    clearDuress();
    expect((await handleEmit(emitRequest(channel, ["x"]), {})).status).toBe(
      204,
    );
    expect(
      readChannelEntries(worktree, channel, 10)?.map((e) => e.line),
    ).toEqual(["x"]);
  });
});

import { afterEach, describe, expect, test } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import { readTurns, readTurnsFromChain, rewindLastUserTurn } from "./claude-transcript";

// rewindLastUserTurn reads + truncates a real file, so each case writes a temp
// transcript and inspects what comes back and what's left on disk.
const tmpFiles: string[] = [];
async function writeTranscript(lines: object[]): Promise<string> {
  const path = join(tmpdir(), `rewind-test-${crypto.randomUUID()}.jsonl`);
  tmpFiles.push(path);
  await Bun.write(path, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return path;
}
const userText = (text: string, extra: object = {}) => ({
  type: "user",
  message: { role: "user", content: text },
  ...extra,
});
const assistant = (text: string) => ({
  type: "assistant",
  message: { role: "assistant", content: [{ type: "text", text }] },
});
const toolResult = () => ({
  type: "user",
  message: { role: "user", content: [{ type: "tool_result", content: "ok" }] },
});

afterEach(async () => {
  while (tmpFiles.length) {
    const p = tmpFiles.pop()!;
    // eslint-disable-next-line promise-safety/no-absorbed-failure -- best-effort temp-file teardown in afterEach; the awaited result is discarded, so undefined only prevents an unhandled rejection when a test already removed the file
    await Bun.file(p).delete().catch(() => undefined);
  }
});

describe("rewindLastUserTurn", () => {
  test("returns null for a missing file", async () => {
    expect(await rewindLastUserTurn(join(tmpdir(), "does-not-exist.jsonl"))).toBeNull();
  });

  test("rewinds a prompt that is the last line", async () => {
    const path = await writeTranscript([assistant("hi"), userText("my prompt")]);
    expect(await rewindLastUserTurn(path)).toBe("my prompt");
    // The user turn is removed; the prior assistant turn stays.
    const left = await Bun.file(path).text();
    expect(left).toContain("hi");
    expect(left).not.toContain("my prompt");
  });

  test("skips trailing metadata lines (the reported bug)", async () => {
    const path = await writeTranscript([
      assistant("answer to previous"),
      { type: "system", content: "..." },
      userText("my prompt"),
      { type: "file-history-snapshot", snapshot: {} },
    ]);
    expect(await rewindLastUserTurn(path)).toBe("my prompt");
    const left = await Bun.file(path).text();
    // Drops the user turn AND the trailing metadata after it.
    expect(left).not.toContain("my prompt");
    expect(left).not.toContain("file-history-snapshot");
    expect(left).toContain("answer to previous");
  });

  test("does not rewind once the agent has started answering", async () => {
    const path = await writeTranscript([
      userText("my prompt"),
      assistant("working on it"),
      { type: "file-history-snapshot", snapshot: {} },
    ]);
    expect(await rewindLastUserTurn(path)).toBeNull();
    // Nothing removed.
    expect(await Bun.file(path).text()).toContain("my prompt");
  });

  test("skips the interrupt sentinel and returns the real prompt", async () => {
    const path = await writeTranscript([
      userText("my prompt"),
      userText("[Request interrupted by user]"),
      { type: "file-history-snapshot", snapshot: {} },
    ]);
    expect(await rewindLastUserTurn(path)).toBe("my prompt");
  });

  test("does not rewind across a tool result (mid-turn)", async () => {
    const path = await writeTranscript([
      userText("my prompt"),
      assistant("calling a tool"),
      toolResult(),
    ]);
    expect(await rewindLastUserTurn(path)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// readTurns / readTurnsFromChain. Unlike rewindLastUserTurn, these need real
// uuid/parentUuid lines: the chain merge dedups on uuid and the branch filter
// walks the forest.
// ---------------------------------------------------------------------------

const T1 = "2026-06-30T01:00:00.000Z";
const T2 = "2026-06-30T02:00:00.000Z";
const T3 = "2026-06-30T03:00:00.000Z";
const FORK_T1 = "2026-06-30T09:00:00.000Z";

const uLine = (uuid: string, parentUuid: string | null, text: string, at: string) => ({
  type: "user",
  uuid,
  parentUuid,
  timestamp: at,
  message: { role: "user", content: text },
});
const aLine = (uuid: string, parentUuid: string | null, text: string, at: string) => ({
  type: "assistant",
  uuid,
  parentUuid,
  timestamp: at,
  message: { role: "assistant", content: [{ type: "text", text }] },
});

describe("readTurnsFromChain", () => {
  test("a forked session's copied lines render once, at the ancestor's times", async () => {
    const first = await writeTranscript([
      uLine("u1", null, "hello", T1),
      aLine("u2", "u1", "hi", T2),
    ]);
    const forked = await writeTranscript([
      uLine("u1", null, "hello", FORK_T1),
      aLine("u2", "u1", "hi", FORK_T1),
      uLine("u3", "u2", "continue", T3),
    ]);

    const turns = await readTurnsFromChain([first, forked]);
    expect(turns.map((t) => [t.role, t.text])).toEqual([
      ["user", "hello"],
      ["assistant", "hi"],
      ["user", "continue"],
    ]);
    expect(turns[0]!.at).toBe(T1);
  });

  test("sinceIso filters after the merge, not before it", async () => {
    const first = await writeTranscript([
      uLine("u1", null, "hello", T1),
      aLine("u2", "u1", "hi", T2),
    ]);
    const forked = await writeTranscript([
      uLine("u1", null, "hello", FORK_T1),
      aLine("u2", "u1", "hi", FORK_T1),
      uLine("u3", "u2", "continue", T3),
    ]);

    const turns = await readTurnsFromChain([first, forked], T3);
    expect(turns.map((t) => t.text)).toEqual(["continue"]);
  });

  test("a chain entry with no transcript on disk yet is skipped", async () => {
    const first = await writeTranscript([uLine("u1", null, "hello", T1)]);
    const absent = join(tmpdir(), `absent-${crypto.randomUUID()}.jsonl`);
    expect((await readTurnsFromChain([first, absent])).map((t) => t.text)).toEqual([
      "hello",
    ]);
  });
});

describe("readTurns", () => {
  test("returns [] for a missing file", async () => {
    expect(await readTurns(join(tmpdir(), "does-not-exist.jsonl"))).toEqual([]);
  });

  test("drops an abandoned rewind branch (behavior change: the branch filter now runs)", async () => {
    // `abandoned` hangs off root but is not on the live leaf→root path, so it is
    // no longer emitted. Before the chain work, readTurns rendered it inline.
    const path = await writeTranscript([
      uLine("root", null, "hello", T1),
      aLine("abandoned", "root", "abandoned attempt", T2),
      aLine("spine", "root", "real answer", T2),
      uLine("leaf", "spine", "continue", T3),
    ]);

    expect((await readTurns(path)).map((t) => t.text)).toEqual([
      "hello",
      "real answer",
      "continue",
    ]);
  });
});

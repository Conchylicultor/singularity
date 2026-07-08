import { afterEach, describe, expect, test } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import { rewindLastUserTurn } from "./claude-transcript";

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

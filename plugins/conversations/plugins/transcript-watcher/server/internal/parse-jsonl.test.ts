import { afterAll, describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readJsonlEvents } from "./parse-jsonl";

// readJsonlEvents only takes a file path (it reads via Bun.file), so each
// fixture is written to a temp JSONL file and parsed end-to-end. This also
// exercises the real activeLineUuids branch-filter, which is the point: the
// rescue only matters because that filter would otherwise drop the line.

const TS = "2026-06-30T00:00:00.000Z";
const tmpFiles: string[] = [];

async function writeFixture(lines: Record<string, unknown>[]): Promise<string> {
  const path = join(tmpdir(), `parse-jsonl-test-${crypto.randomUUID()}.jsonl`);
  await Bun.write(path, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  tmpFiles.push(path);
  return path;
}

// A minimal user line carrying string content, so the spine has real turns.
const userLine = (uuid: string, parentUuid: string | null, text: string) => ({
  type: "user",
  uuid,
  parentUuid,
  timestamp: TS,
  message: { role: "user", content: text },
});

const assistantLine = (uuid: string, parentUuid: string | null, text: string) => ({
  type: "assistant",
  uuid,
  parentUuid,
  timestamp: TS,
  message: { role: "assistant", content: [{ type: "text", text }] },
});

const hookErrorLine = (uuid: string, parentUuid: string | null) => ({
  type: "attachment",
  uuid,
  parentUuid,
  timestamp: TS,
  attachment: {
    type: "hook_non_blocking_error",
    hookName: "PreToolUse:Bash",
    stderr: "Module not found: guard.ts",
  },
});

afterAll(async () => {
  await Promise.all(tmpFiles.map((p) => Bun.file(p).delete()));
});

describe("readJsonlEvents — off-spine attachment rescue", () => {
  test("rescues an off-spine dead-leaf hook-error whose parent is on the live spine", async () => {
    // root → spine1 → spine2 is the live spine (spine2 is the highest-index
    // leaf). `att` hangs off the live `root` but is itself a dead-end side-leaf
    // appended before spine2, so activeLineUuids drops it — the exact shape
    // Claude uses for hook_non_blocking_error.
    const path = await writeFixture([
      userLine("root", null, "hello"),
      assistantLine("spine1", "root", "working"),
      hookErrorLine("att", "root"),
      userLine("spine2", "spine1", "continue"),
    ]);

    const events = await readJsonlEvents(path);
    const attachments = events.filter((e) => e.kind === "attachment");
    expect(attachments).toHaveLength(1);
    expect(attachments[0]).toMatchObject({
      kind: "attachment",
      subtype: "hook_non_blocking_error",
    });
  });

  test("still drops an attachment whose parent is on an abandoned branch", async () => {
    // root → spine1 → spine2 is live. `abandoned` is an abandoned rewind branch
    // off root (lower index than spine2), and `att` hangs off `abandoned`.
    // Since `abandoned` is NOT on the kept spine, the attachment must stay
    // dropped — the rescue only readmits attachments anchored to live nodes.
    const path = await writeFixture([
      userLine("root", null, "hello"),
      assistantLine("spine1", "root", "working"),
      assistantLine("abandoned", "root", "abandoned attempt"),
      hookErrorLine("att", "abandoned"),
      userLine("spine2", "spine1", "continue"),
    ]);

    const events = await readJsonlEvents(path);
    expect(events.filter((e) => e.kind === "attachment")).toHaveLength(0);
  });

  test("a normal on-spine attachment is unchanged (regression)", async () => {
    // Here the attachment is itself part of the live leaf→root chain
    // (root → att → spine_next), so it was always kept by the branch-filter.
    const path = await writeFixture([
      userLine("root", null, "hello"),
      hookErrorLine("att", "root"),
      userLine("spine_next", "att", "continue"),
    ]);

    const events = await readJsonlEvents(path);
    const attachments = events.filter((e) => e.kind === "attachment");
    expect(attachments).toHaveLength(1);
    expect(attachments[0]).toMatchObject({
      kind: "attachment",
      subtype: "hook_non_blocking_error",
    });
  });
});

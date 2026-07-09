import { afterAll, describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  mergeChainLines,
  readJsonlEvents,
  readJsonlEventsFromChain,
} from "./parse-jsonl";

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
const userLine = (
  uuid: string,
  parentUuid: string | null,
  text: string,
  at: string = TS,
) => ({
  type: "user",
  uuid,
  parentUuid,
  timestamp: at,
  message: { role: "user", content: text },
});

const assistantLine = (
  uuid: string,
  parentUuid: string | null,
  text: string,
  at: string = TS,
) => ({
  type: "assistant",
  uuid,
  parentUuid,
  timestamp: at,
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

// ---------------------------------------------------------------------------
// Session chains: one conversation spread over several Claude session files.
// ---------------------------------------------------------------------------

const T1 = "2026-06-30T01:00:00.000Z";
const T2 = "2026-06-30T02:00:00.000Z";
const T3 = "2026-06-30T03:00:00.000Z";
const T4 = "2026-06-30T04:00:00.000Z";

// A forked session rewrites the copied lines' timestamps; keep them distinct so
// "first wins" is observable rather than coincidental.
const FORK_T1 = "2026-06-30T09:00:00.000Z";
const FORK_T2 = "2026-06-30T09:30:00.000Z";

const summaryLine = (text: string, at: string) => ({
  type: "summary",
  timestamp: at,
  summary: text,
});

const chainFile = (path: string, lines: Record<string, unknown>[]) => ({
  path,
  raw: lines.map((l) => JSON.stringify(l)).join("\n") + "\n",
});

const uuidsOf = (lines: Record<string, unknown>[]) => lines.map((l) => l.uuid);
const stampsOf = (lines: Record<string, unknown>[]) =>
  lines.map((l) => l.timestamp);
const textsOf = (events: { kind: string }[], kind: string) =>
  events
    .filter((e): e is { kind: string; text: string } => e.kind === kind)
    .map((e) => e.text);

describe("mergeChainLines", () => {
  test("superset fork — shared uuids appear once, with the ancestor's timestamps", () => {
    // B is what Claude writes when it forks A: every one of A's lines is copied
    // verbatim (same uuid, restamped), then B continues past the copy.
    const a = chainFile("a.jsonl", [
      userLine("u1", null, "hello", T1),
      assistantLine("u2", "u1", "hi", T2),
    ]);
    const b = chainFile("b.jsonl", [
      userLine("u1", null, "hello", FORK_T1),
      assistantLine("u2", "u1", "hi", FORK_T2),
      userLine("u3", "u2", "continue", T3),
    ]);

    const merged = mergeChainLines([a, b]);
    expect(uuidsOf(merged)).toEqual(["u1", "u2", "u3"]);
    expect(stampsOf(merged)).toEqual([T1, T2, T3]);
  });

  test("disjoint fresh session — nothing is deduped, chain order is preserved", () => {
    const a = chainFile("a.jsonl", [userLine("u1", null, "hello", T1)]);
    const c = chainFile("c.jsonl", [
      userLine("c1", null, "fresh start", T3),
      assistantLine("c2", "c1", "ok", T4),
    ]);

    expect(uuidsOf(mergeChainLines([a, c]))).toEqual(["u1", "c1", "c2"]);
  });

  test("midpoint fork — the ancestor's post-fork lines survive the merge itself", () => {
    // The merge is uuid-dedup only; dropping `a2` is the branch filter's doing,
    // which runs one level up. Asserted end-to-end below.
    const a = chainFile("a.jsonl", [
      userLine("u1", null, "hello", T1),
      assistantLine("u2", "u1", "hi", T2),
      userLine("a2", "u2", "ancestor kept talking", T3),
    ]);
    const b = chainFile("b.jsonl", [
      userLine("u1", null, "hello", FORK_T1),
      assistantLine("u2", "u1", "hi", FORK_T2),
      userLine("b1", "u2", "fork kept talking", T4),
    ]);

    expect(uuidsOf(mergeChainLines([a, b]))).toEqual(["u1", "u2", "a2", "b1"]);
  });

  test("uuid-less metadata lines survive from every file, even when identical", () => {
    // Dedup is keyed on uuid; metadata markers carry none, so each file's copy
    // is kept. They are not in the forest, so the branch filter never sees them.
    const a = chainFile("a.jsonl", [
      { type: "ai-title", title: "shared" },
      userLine("u1", null, "hello", T1),
    ]);
    const b = chainFile("b.jsonl", [
      { type: "ai-title", title: "shared" },
      userLine("u1", null, "hello", FORK_T1),
      { type: "permission-mode", mode: "default" },
    ]);

    const merged = mergeChainLines([a, b]);
    expect(merged.map((l) => l.type)).toEqual([
      "ai-title",
      "user",
      "ai-title",
      "permission-mode",
    ]);
  });

  test("a malformed line is skipped; the rest of the file still parses", () => {
    const files = [
      { path: "a.jsonl", raw: `{"uuid":"u1"}\nnot json\n{"uuid":"u2"}\n` },
    ];
    expect(uuidsOf(mergeChainLines(files))).toEqual(["u1", "u2"]);
  });
});

describe("readJsonlEventsFromChain", () => {
  test("superset fork — the copied spine renders once, at the ancestor's times", async () => {
    const a = await writeFixture([
      userLine("u1", null, "hello", T1),
      assistantLine("u2", "u1", "hi", T2),
    ]);
    const b = await writeFixture([
      userLine("u1", null, "hello", FORK_T1),
      assistantLine("u2", "u1", "hi", FORK_T2),
      userLine("u3", "u2", "continue", T3),
    ]);

    const events = await readJsonlEventsFromChain([a, b]);
    expect(textsOf(events, "user-text")).toEqual(["hello", "continue"]);
    expect(textsOf(events, "assistant-text")).toEqual(["hi"]);
    expect(events[0]).toMatchObject({ kind: "user-text", at: T1 });
    expect(events[1]).toMatchObject({ kind: "assistant-text", at: T2 });
  });

  test("disjoint fresh session — both root trees keep their leaf→root path", async () => {
    const a = await writeFixture([
      userLine("u1", null, "hello", T1),
      assistantLine("u2", "u1", "hi", T2),
    ]);
    const c = await writeFixture([
      userLine("c1", null, "fresh start", T3),
      assistantLine("c2", "c1", "ok", T4),
    ]);

    const events = await readJsonlEventsFromChain([a, c]);
    expect(textsOf(events, "user-text")).toEqual(["hello", "fresh start"]);
    expect(textsOf(events, "assistant-text")).toEqual(["hi", "ok"]);
  });

  test("midpoint fork — the ancestor's post-fork lines are dropped as an abandoned branch", async () => {
    // Pins the documented caveat: after the merge, `a2` and `b1` are siblings
    // under `u2` in ONE tree, and activeLineUuids keeps only the highest-index
    // leaf's path. This is the one place the chain merge can hide a line.
    const a = await writeFixture([
      userLine("u1", null, "hello", T1),
      assistantLine("u2", "u1", "hi", T2),
      userLine("a2", "u2", "ancestor kept talking", T3),
    ]);
    const b = await writeFixture([
      userLine("u1", null, "hello", FORK_T1),
      assistantLine("u2", "u1", "hi", FORK_T2),
      userLine("b1", "u2", "fork kept talking", T4),
    ]);

    const events = await readJsonlEventsFromChain([a, b]);
    expect(textsOf(events, "user-text")).toEqual(["hello", "fork kept talking"]);
  });

  test("uuid-less metadata lines from every file reach the event stream", async () => {
    const a = await writeFixture([
      userLine("u1", null, "hello", T1),
      summaryLine("first segment", T2),
    ]);
    const b = await writeFixture([
      userLine("u1", null, "hello", FORK_T1),
      summaryLine("second segment", T3),
    ]);

    const events = await readJsonlEventsFromChain([a, b]);
    expect(textsOf(events, "summary")).toEqual([
      "first segment",
      "second segment",
    ]);
  });

  test("a chain entry with no transcript on disk yet is skipped", async () => {
    const a = await writeFixture([userLine("u1", null, "hello", T1)]);
    const missing = join(tmpdir(), `parse-jsonl-absent-${crypto.randomUUID()}.jsonl`);

    const events = await readJsonlEventsFromChain([a, missing]);
    expect(textsOf(events, "user-text")).toEqual(["hello"]);
  });

  test("a length-1 chain is identical to readJsonlEvents", async () => {
    // Same fixture shape as the abandoned-branch case above: the branch filter,
    // the attachment rescue and the event order must all be untouched.
    const path = await writeFixture([
      userLine("root", null, "hello", T1),
      assistantLine("spine1", "root", "working", T2),
      assistantLine("abandoned", "root", "abandoned attempt", T2),
      hookErrorLine("att", "root"),
      userLine("spine2", "spine1", "continue", T3),
    ]);

    const single = await readJsonlEvents(path);
    expect(await readJsonlEventsFromChain([path])).toEqual(single);
    expect(textsOf(single, "user-text")).toEqual(["hello", "continue"]);
    expect(textsOf(single, "assistant-text")).toEqual(["working"]);
    expect(single.filter((e) => e.kind === "attachment")).toHaveLength(1);
  });
});

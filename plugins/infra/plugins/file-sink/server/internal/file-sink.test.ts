import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineFileSink, getFileSinks, openDynamicSink } from "./file-sink";

// Hermetic: every sink writes into an isolated temp dir. The registry is
// process-global (a sink is declared exactly once), so each test uses a UNIQUE id
// to avoid cross-test collisions. `defineFileSink` takes an explicit maxBytes/keep
// so rotation is forced with a tiny cap instead of writing 128 MB.

let dir: string;
let counter = 0;
function uniqueId(): string {
  return `test-sink-${process.pid}-${counter++}`;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "file-sink-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function rotatedFiles(base: string): string[] {
  return readdirSync(dir)
    .filter((n) => new RegExp(`^${base}\\.\\d+$`).test(n))
    .sort();
}

describe("defineFileSink rotation", () => {
  test("appends under the cap without rotating", () => {
    const path = join(dir, "a.jsonl");
    const sink = defineFileSink({
      id: uniqueId(),
      description: "t",
      path,
      maxBytes: 1 << 20,
      keep: 3,
    });
    sink.append("line-1");
    sink.append("line-2");

    expect(readFileSync(path, "utf8").trim().split("\n")).toEqual(["line-1", "line-2"]);
    expect(existsSync(path + ".1")).toBe(false);
  });

  test("rotates once the cap is crossed and keeps the live file small", () => {
    const path = join(dir, "b.jsonl");
    const sink = defineFileSink({
      id: uniqueId(),
      description: "t",
      path,
      maxBytes: 10, // "line-1\n" is 7 bytes: the 2nd append (7+7=14) crosses it.
      keep: 3,
    });
    sink.append("line-1"); // seeds the live file (7 ≤ 10)
    sink.append("line-2"); // 7 + 7 > 10 → rotate, then fresh write

    // Live file holds only the post-rotation line.
    expect(readFileSync(path, "utf8").trim().split("\n").filter(Boolean)).toEqual([
      "line-2",
    ]);
    // The rotated file exists and holds the pre-rotation content.
    expect(existsSync(path + ".1")).toBe(true);
    expect(readFileSync(path + ".1", "utf8").trim()).toBe("line-1");
  });

  test("keeps at most `keep` rotated files; oldest is unlinked (window shifts .1→.2→.3)", () => {
    const path = join(dir, "c.jsonl");
    const sink = defineFileSink({
      id: uniqueId(),
      description: "t",
      path,
      maxBytes: 5, // "L0\n" is 3 bytes: every subsequent append rotates.
      keep: 3,
    });
    for (let i = 0; i < 8; i++) sink.append(`L${i}`);

    // keep is 3 — never more, regardless of how many rotations occurred.
    expect(rotatedFiles("c\\.jsonl")).toEqual([
      "c.jsonl.1",
      "c.jsonl.2",
      "c.jsonl.3",
    ]);
    expect(existsSync(path + ".4")).toBe(false);
    // Newest rotation is .1; the window shifts down; the oldest was unlinked.
    expect(readFileSync(path, "utf8").trim()).toBe("L7");
    expect(readFileSync(path + ".1", "utf8").trim()).toBe("L6");
    expect(readFileSync(path + ".2", "utf8").trim()).toBe("L5");
    expect(readFileSync(path + ".3", "utf8").trim()).toBe("L4");
  });

  test("bound reflects defaults (128 MB × 3) when unset", () => {
    const sink = defineFileSink({
      id: uniqueId(),
      description: "t",
      path: join(dir, "f.jsonl"),
    });
    expect(sink.bound).toEqual({ kind: "rotate", maxBytes: 128 * 1024 * 1024, keep: 3 });
  });
});

describe("defineFileSink / getFileSinks registry", () => {
  test("a duplicate id throws (declared exactly once)", () => {
    const id = uniqueId();
    defineFileSink({ id, description: "t", path: join(dir, "d.jsonl") });
    expect(() =>
      defineFileSink({ id, description: "t", path: join(dir, "d2.jsonl") }),
    ).toThrow(/already defined/);
  });

  test("getFileSinks returns a copy, not the live map", () => {
    const id = uniqueId();
    const sink = defineFileSink({ id, description: "t", path: join(dir, "e.jsonl") });
    const first = getFileSinks() as Map<string, unknown>;
    first.delete(id);
    first.set("intruder", {});

    const second = getFileSinks();
    expect(second.get(id)).toBe(sink);
    expect(second.has("intruder")).toBe(false);
  });
});

describe("openDynamicSink", () => {
  test("sanitizes the name into the dir, rotates, and is NOT registered", () => {
    const before = getFileSinks().size;
    const sink = openDynamicSink(dir, "weird/name!");
    // Path-traversal-safe: every non-[A-Za-z0-9_-] char becomes "_".
    expect(sink.path).toBe(join(dir, "weird_name_.jsonl"));

    sink.append("x");
    expect(existsSync(join(dir, "weird_name_.jsonl"))).toBe(true);
    // A dynamic sink is covered by one family bound, not the registry.
    expect(getFileSinks().size).toBe(before);
  });
});

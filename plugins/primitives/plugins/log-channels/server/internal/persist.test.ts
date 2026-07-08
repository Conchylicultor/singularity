import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendEntryToDir, listChannelsInDir, rotateChannel } from "./persist";

// Hermetic: everything runs in an isolated temp dir. We never touch the real
// ~/.singularity logs. appendEntryToDir takes an explicit dir + cap so we can force
// rotation with a tiny cap instead of writing 128 MB.

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "log-rotate-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function line(n: number): { t: number; stream: "stdout"; line: string } {
  return { t: n, stream: "stdout", line: `line-${n}` };
}

function rotatedFiles(): string[] {
  return readdirSync(dir)
    .filter((n) => /^channel\.jsonl\.\d+$/.test(n))
    .sort();
}

describe("log-channels rotation", () => {
  test("rotates once the cap is crossed and keeps the live file small", () => {
    // Tiny cap so each ~40-byte line crosses it after a couple of writes.
    const cap = 60;
    appendEntryToDir(dir, "channel", line(1), cap); // seeds live file
    appendEntryToDir(dir, "channel", line(2), cap); // crosses -> rotate, fresh write

    const liveFile = join(dir, "channel.jsonl");
    expect(existsSync(liveFile)).toBe(true);
    // Live file holds only the post-rotation line.
    const live = readFileSync(liveFile, "utf8").trim().split("\n").filter(Boolean);
    expect(live.length).toBe(1);
    expect(statSync(liveFile).size).toBeLessThan(cap);

    // The rotated file exists and holds the pre-rotation content.
    expect(existsSync(join(dir, "channel.jsonl.1"))).toBe(true);
  });

  test("keeps at most KEEP_ROTATIONS rotated files; oldest is unlinked", () => {
    const cap = 30; // every line crosses -> a rotation on each subsequent write
    for (let i = 0; i < 8; i++) appendEntryToDir(dir, "channel", line(i), cap);

    const rotated = rotatedFiles();
    // KEEP_ROTATIONS is 3 — never more, regardless of how many rotations occurred.
    expect(rotated).toEqual(["channel.jsonl.1", "channel.jsonl.2", "channel.jsonl.3"]);
    expect(existsSync(join(dir, "channel.jsonl.4"))).toBe(false);
    // Live file still present.
    expect(existsSync(join(dir, "channel.jsonl"))).toBe(true);
  });

  test("listChannels excludes rotated files", () => {
    const cap = 30;
    for (let i = 0; i < 6; i++) appendEntryToDir(dir, "channel", line(i), cap);
    // Rotated files (channel.jsonl.N) exist on disk...
    expect(rotatedFiles().length).toBeGreaterThan(0);
    // ...but only the live channel is discoverable.
    expect(listChannelsInDir(dir)).toEqual(["channel"]);
  });

  test("rotateChannel tolerates missing slots (no live/rotated files yet)", () => {
    // Must not throw when there is nothing to rotate.
    expect(() => rotateChannel(dir, "channel")).not.toThrow();
    expect(rotatedFiles()).toEqual([]);
  });
});

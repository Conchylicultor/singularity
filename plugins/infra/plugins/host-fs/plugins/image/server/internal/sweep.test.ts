import { expect, test } from "bun:test";
import { selectEvictions, TMP_STALE_MS } from "./sweep";

const DAY = 24 * 60 * 60 * 1000;
const now = 100 * DAY;

test("removes stale temp files, then expired copies, then the oldest past the cap", () => {
  const out = selectEvictions(
    [
      { name: ".tmp-a-1", bytes: 5, lastUsedMs: now - TMP_STALE_MS - 1 },
      { name: ".tmp-b-1", bytes: 5, lastUsedMs: now },
      { name: "old.jpg", bytes: 10, lastUsedMs: now - 31 * DAY },
      { name: "a.jpg", bytes: 10, lastUsedMs: now - 3 * DAY },
      { name: "b.jpg", bytes: 10, lastUsedMs: now - 2 * DAY },
      { name: "c.jpg", bytes: 10, lastUsedMs: now - 1 * DAY },
    ],
    { nowMs: now, ttlMs: 30 * DAY, capBytes: 24 },
  );
  expect(out.map((e) => [e.name, e.reason])).toEqual([
    [".tmp-a-1", "stale-tmp"],
    ["old.jpg", "ttl"],
    ["a.jpg", "cap"],
    ["b.jpg", "cap"],
  ]);
});

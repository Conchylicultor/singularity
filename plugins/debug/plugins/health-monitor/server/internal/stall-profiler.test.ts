import { expect, test } from "bun:test";
import { startSamplingProfiler, samplingProfilerStackTraces } from "bun:jsc";
import { aggregateTraces } from "./stall-profiler";

// Synthetic traces: deterministic histogram + percentage math.
test("aggregateTraces builds leaf + stack histograms with percentages", () => {
  const f = (name: string, sourceURL?: string, line?: number) => ({
    name,
    sourceURL,
    line,
    column: 1,
    category: sourceURL ? "FTL" : "Unknown Executable",
    flags: 0,
  });
  const traces = [
    { timestamp: 1, frames: [f("hot", "/x/a.ts", 10), f("caller", "/x/a.ts", 20)] },
    { timestamp: 2, frames: [f("hot", "/x/a.ts", 10), f("caller", "/x/a.ts", 20)] },
    { timestamp: 3, frames: [f("hot", "/x/a.ts", 10), f("caller", "/x/a.ts", 20)] },
    { timestamp: 4, frames: [f("cold", "/x/b.ts", 5), f("other", "/x/b.ts", 7)] },
  ];
  const { topLeaves, topStacks } = aggregateTraces(traces);

  expect(topLeaves[0]?.key).toContain("hot @");
  expect(topLeaves[0]?.count).toBe(3);
  expect(topLeaves[0]?.pct).toBe(75);
  expect(topLeaves[1]?.key).toContain("cold @");
  expect(topLeaves[1]?.count).toBe(1);

  expect(topStacks[0]?.stack).toBe("hot ← caller");
  expect(topStacks[0]?.count).toBe(3);
  expect(topStacks[0]?.pct).toBe(75);
});

test("aggregateTraces condenses native/unknown frames", () => {
  const { topLeaves } = aggregateTraces([
    {
      timestamp: 1,
      frames: [{ name: "now", line: 4_294_967_295, category: "Unknown Executable" }],
    },
  ]);
  expect(topLeaves[0]?.key).toBe("now [Unknown Executable]");
});

// The leaf↔stack association: a consumer must be able to attribute the DOMINANT
// stack from that stack's own frames, never from the independent topLeaves
// histogram (which may describe a different, minority stall).
const jsFrame = (name: string, sourceURL: string, line: number) => ({
  name,
  sourceURL,
  line,
  column: 1,
  category: "FTL",
  flags: 0,
});
const nativeFrame = (name: string) => ({
  name,
  line: 4_294_967_295,
  category: "Unknown Executable",
  flags: 0,
});

test("topStacks[i].frames aligns 1:1 with stack.split(' ← ')", () => {
  const { topStacks } = aggregateTraces([
    {
      timestamp: 1,
      frames: [
        nativeFrame("spawn"),
        jsFrame("listPanes", "/x/tmux.ts", 499),
        jsFrame("collectLive", "/x/poller.ts", 12),
      ],
    },
    { timestamp: 2, frames: [jsFrame("cold", "/x/drizzle.ts", 7)] },
  ]);

  expect(topStacks.length).toBe(2);
  for (const s of topStacks) {
    const names = s.stack.split(" ← ");
    expect(s.frames?.length).toBe(names.length);
    // frames[i] resolves the same frame whose bare name is names[i].
    names.forEach((name, i) => expect(s.frames?.[i]).toStartWith(`${name} `));
  }

  expect(topStacks[0]?.stack).toBe("spawn ← listPanes ← collectLive");
  expect(topStacks[0]?.frames).toEqual([
    "spawn [Unknown Executable]",
    "listPanes @ /x/tmux.ts:499",
    "collectLive @ /x/poller.ts:12",
  ]);
});

test("topStacks[i].frames[0] is the leaf key counted in topLeaves", () => {
  // The bug's exact shape: a native-leaf stack dominates (3/4 samples) while a
  // cold, attributable drizzle leaf sits in topLeaves.
  const hot = [nativeFrame("spawn"), jsFrame("listPanes", "/x/tmux.ts", 499)];
  const { topLeaves, topStacks } = aggregateTraces([
    { timestamp: 1, frames: hot },
    { timestamp: 2, frames: hot },
    { timestamp: 3, frames: hot },
    { timestamp: 4, frames: [jsFrame("is", "/x/drizzle-orm/entity.js", 7)] },
  ]);

  const leafOfTop = topStacks[0]?.frames?.[0];
  expect(leafOfTop).toBe("spawn [Unknown Executable]");
  // That key is a real leaf in the histogram, with the same count as its stack.
  const counted = topLeaves.find((l) => l.key === leafOfTop);
  expect(counted?.count).toBe(topStacks[0]?.count);
  expect(counted?.count).toBe(3);

  // Every top stack's frames[0] is a counted leaf.
  for (const s of topStacks) {
    expect(topLeaves.some((l) => l.key === s.frames?.[0])).toBe(true);
  }
});

test("the 40-frame cap applies identically to stack and frames", () => {
  const deep = Array.from({ length: 60 }, (_, i) => jsFrame(`f${i}`, "/x/deep.ts", i));
  const { topStacks } = aggregateTraces([{ timestamp: 1, frames: deep }]);

  const names = topStacks[0]?.stack.split(" ← ") ?? [];
  expect(names.length).toBe(40);
  expect(names.at(-1)).toBe("f39");
  expect(topStacks[0]?.frames?.length).toBe(40);
  expect(topStacks[0]?.frames?.at(-1)).toBe("f39 @ /x/deep.ts:39");
  expect(topStacks[0]?.frames?.[0]).toBe("f0 @ /x/deep.ts:0");
});

test("an unattributed innermost frame still yields `name [category]` at frames[0]", () => {
  const { topStacks } = aggregateTraces([
    { timestamp: 1, frames: [nativeFrame("spawn"), nativeFrame("execve")] },
  ]);
  expect(topStacks[0]?.frames).toEqual([
    "spawn [Unknown Executable]",
    "execve [Unknown Executable]",
  ]);
});

// End-to-end: the JSC sampler thread captures the blocked main-thread stack
// during a synchronous block, and aggregateTraces names the function. This is the
// exact capture path drainAndMaybeDump uses on a real stall.
test("real JSC capture names the blocking function", () => {
  startSamplingProfiler();

  function uniquelyNamedBusyBlock(): number {
    let x = 0;
    const end = Date.now() + 700;
    while (Date.now() < end) x += Math.sqrt(x * 1.0001 + 1);
    return x;
  }
  uniquelyNamedBusyBlock();

  const { traces } = samplingProfilerStackTraces();
  expect(traces.length).toBeGreaterThan(0);

  const { topLeaves, topStacks } = aggregateTraces(traces);
  const named = JSON.stringify({ topLeaves, topStacks });
  expect(named).toContain("uniquelyNamedBusyBlock");
});

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

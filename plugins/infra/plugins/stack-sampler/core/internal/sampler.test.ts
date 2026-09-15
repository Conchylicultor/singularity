import { expect, test } from "bun:test";
import {
  createStackSamplerClaim,
  frameKey,
  normalizeTraces,
  type StackFrame,
} from "./sampler";

const NO_LINE = 4_294_967_295;

test("normalizeTraces maps JSC's sentinels and missing fields to typed values", () => {
  const samples = normalizeTraces({
    interval: 0.001,
    traces: [
      {
        timestamp: 12.5,
        frames: [
          {
            name: "spin",
            sourceURL: "/repo/a.ts",
            line: 9,
            column: 3,
            category: "LLInt",
            flags: 0,
          },
          {
            name: "evaluate",
            line: NO_LINE,
            column: NO_LINE,
            category: "Unknown Executable",
          },
          { name: "", sourceURL: "", line: 2, column: 1 },
        ],
      },
    ],
  });

  expect(samples).toEqual([
    {
      timestamp: 12.5,
      frames: [
        {
          name: "spin",
          sourceURL: "/repo/a.ts",
          line: 9,
          column: 3,
          category: "LLInt",
        },
        {
          name: "evaluate",
          sourceURL: null,
          line: null,
          column: null,
          category: "Unknown Executable",
        },
        { name: "", sourceURL: null, line: 2, column: 1, category: "native" },
      ],
    },
  ]);
});

test("normalizeTraces drops frameless traces", () => {
  const samples = normalizeTraces({
    interval: 0.001,
    traces: [
      { timestamp: 1, frames: [] },
      { timestamp: 2 },
      {
        timestamp: 3,
        frames: [
          {
            name: "kept",
            sourceURL: "/x.ts",
            line: 1,
            column: 1,
            category: "FTL",
          },
        ],
      },
    ],
  });
  expect(samples.map((s) => s.timestamp)).toEqual([3]);
});

test("normalizeTraces throws on a result that is not the JSC shape", () => {
  expect(() => normalizeTraces(undefined)).toThrow(/traces/);
  expect(() => normalizeTraces({ interval: 1 })).toThrow(/traces/);
  expect(() =>
    normalizeTraces({ traces: [{ frames: [{ name: "x" }] }] }),
  ).toThrow(/timestamp/);
});

const frame = (over: Partial<StackFrame>): StackFrame => ({
  name: "fn",
  sourceURL: null,
  line: null,
  column: null,
  category: "native",
  ...over,
});

test("frameKey: a JS frame with source + line reads `name @ path:line`", () => {
  const f = frame({
    name: "listPanes",
    sourceURL: "/repo/x/tmux.ts",
    line: 499,
    category: "FTL",
  });
  expect(frameKey(f)).toBe("listPanes @ /repo/x/tmux.ts:499");
  expect(frameKey(f, (s) => s.replace("/repo/", ""))).toBe(
    "listPanes @ x/tmux.ts:499",
  );
  expect(frameKey({ ...f, name: "" })).toBe(
    "(anonymous) @ /repo/x/tmux.ts:499",
  );
});

test("frameKey: a frame without source or line reads `name [category]`", () => {
  expect(frameKey(frame({ name: "now", category: "Unknown Executable" }))).toBe(
    "now [Unknown Executable]",
  );
  // A line without a source (asyncModuleEvaluation) is still not attributable.
  expect(
    frameKey(
      frame({ name: "asyncModuleEvaluation", line: 2, category: "LLInt" }),
    ),
  ).toBe("asyncModuleEvaluation [LLInt]");
  expect(frameKey(frame({ name: "", category: "" }))).toBe(
    "(anonymous) [native]",
  );
  // `shorten` only ever sees a real source path.
  expect(frameKey(frame({ name: "spawn" }), () => "never")).toBe(
    "spawn [native]",
  );
});

// The claim logic, against a fake profiler. The process-wide
// `claimStackSampler` is this same function bound to bun:jsc; it is not claimed
// here because `bun test` runs every file in one process, and a real claim under
// a test owner would make health-monitor's own claim throw.
function fakeBackend() {
  const state = {
    starts: 0,
    raw: { interval: 0.001, traces: [] as unknown[] },
  };
  return {
    state,
    backend: { start: () => void (state.starts += 1), read: () => state.raw },
  };
}

test("claim: the same owner twice gets the same handle, armed once", () => {
  const { state, backend } = fakeBackend();
  const claim = createStackSamplerClaim(backend);
  const a = claim("health-monitor");
  const b = claim("health-monitor");
  expect(b).toBe(a);
  expect(state.starts).toBe(1);
});

test("claim: a second owner throws, naming both owners", () => {
  const { state, backend } = fakeBackend();
  const claim = createStackSamplerClaim(backend);
  claim("health-monitor");
  expect(() => claim("check-thread-watch")).toThrow(
    /"check-thread-watch" cannot claim .* "health-monitor" already owns it/,
  );
  expect(state.starts).toBe(1);
});

test("claim: drain normalizes each read", () => {
  const { state, backend } = fakeBackend();
  const sampler = createStackSamplerClaim(backend)("owner");
  state.raw = {
    interval: 0.001,
    traces: [
      {
        timestamp: 4,
        frames: [
          { name: "hot", sourceURL: "/a.ts", line: NO_LINE, category: "FTL" },
        ],
      },
    ],
  };
  expect(sampler.drain()).toEqual([
    {
      timestamp: 4,
      frames: [
        {
          name: "hot",
          sourceURL: "/a.ts",
          line: null,
          column: null,
          category: "FTL",
        },
      ],
    },
  ]);
});

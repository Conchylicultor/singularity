import { describe, expect, test } from "bun:test";
import {
  fallbackVerdict,
  orderStepsForDisplay,
  renderStepBlock,
  renderVerdict,
  type Verdict,
} from "./build-output";

const URL = "http://att-x.localhost:9000";

function failureVerdict(steps: Verdict["steps"], viteOnly = false): Verdict {
  return {
    ok: false,
    headline: "BUILD FAILED — checks",
    reason: [
      `NOT DEPLOYED. Nothing was published; ${URL} still serves the previous build.`,
      viteOnly ? "The frontend compiled, but the artifact was discarded." : "",
    ].filter(Boolean),
    pointers: [
      "Full output: /home/x/.singularity/worktrees/att-x/build.log",
      "Check logs:  /home/x/.singularity/worktrees/att-x/check.log",
    ],
    steps,
  };
}

describe("orderStepsForDisplay", () => {
  test("failures last, stable within each group", () => {
    const steps = [
      { label: "a", success: true },
      { label: "b", success: false },
      { label: "c", success: true },
      { label: "d", success: false },
    ];
    expect(orderStepsForDisplay(steps).map((s) => s.label)).toEqual(["a", "c", "b", "d"]);
  });

  test("does not mutate its input", () => {
    const steps = [
      { label: "a", success: false },
      { label: "b", success: true },
    ];
    orderStepsForDisplay(steps);
    expect(steps.map((s) => s.label)).toEqual(["a", "b"]);
  });
});

describe("renderStepBlock", () => {
  test("prefixes every replayed line with `│ ` and preserves each stream", () => {
    const block = renderStepBlock({
      id: "viteBuild",
      label: "vite build",
      durationMs: 72_200,
      success: true,
      lines: [
        { text: "vite v6.0.1 building for production...", stream: "stdout" },
        { text: "✓ built in 72.2s", stream: "stdout" },
        { text: "a warning", stream: "stderr" },
      ],
    });
    const [header, ...replay] = block;
    // Assert the header exists, then narrow — the test reads header.stream/.text,
    // so a missing header must fail loudly rather than throw a cryptic undefined.
    if (!header) throw new Error("renderStepBlock must return a header line");
    expect(header.stream).toBe("stdout");
    expect(header.text.startsWith("── vite build ✓")).toBe(true);
    for (const line of replay) expect(line.text.startsWith("│ ")).toBe(true);
    // The borrowed `✓ built` line is quoted, not a bare success line.
    expect(replay.some((l) => l.text === "│ ✓ built in 72.2s")).toBe(true);
    expect(replay.find((l) => l.text.includes("a warning"))?.stream).toBe("stderr");
  });
});

describe("renderVerdict — failure", () => {
  test("last lines are exactly the pointers", () => {
    const v = failureVerdict([
      { label: "checks", success: false },
      { label: "vite build", success: true },
    ]);
    const lines = renderVerdict(v).split("\n");
    expect(lines.slice(-v.pointers.length)).toEqual(v.pointers.map((p) => `  ${p}`));
  });

  test("contains NOT DEPLOYED, the worktree URL, and a roster entry per step", () => {
    const v = failureVerdict([
      { label: "checks", success: false },
      { label: "vite build", success: true },
    ]);
    const out = renderVerdict(v);
    expect(out).toContain("NOT DEPLOYED");
    expect(out).toContain(URL);
    expect(out).toContain("checks ✗");
    expect(out).toContain("vite build ✓");
  });

  test("a passing vite step has no bare ✓-line outside a `│ ` quote", () => {
    // The verdict never replays step lines; only renderStepBlock does, and it
    // quotes every one. So a rendered verdict of a failure where vite passed
    // carries vite's success only as the roster glyph `vite build ✓`, never a
    // free-standing `✓ built`.
    const v = failureVerdict([
      { label: "checks", success: false },
      { label: "vite build", success: true },
    ]);
    for (const line of renderVerdict(v).split("\n")) {
      if (line.includes("built")) expect(line.startsWith("│ ")).toBe(true);
    }
  });
});

describe("renderVerdict — box width", () => {
  test("a headline longer than 60 chars is not clipped", () => {
    const headline = "BUILD FAILED — " + "x".repeat(80);
    const out = renderVerdict({
      ok: false,
      headline,
      reason: ["short"],
      pointers: ["Full output: /tmp/build.log"],
      steps: [{ label: "checks", success: false }],
    });
    const boxRow = out.split("\n").find((l) => l.startsWith("║"))!;
    expect(boxRow).toContain(headline);
    const topBorder = out.split("\n")[0];
    if (topBorder === undefined) throw new Error("renderVerdict produced no output");
    expect(topBorder.length).toBeGreaterThanOrEqual(headline.length);
  });
});

describe("renderVerdict — success", () => {
  test("contains BUILD OK and the url", () => {
    const out = renderVerdict({
      ok: true,
      headline: "BUILD OK — deployed",
      notes: [URL],
      pointers: [],
      steps: [
        { label: "checks", success: true },
        { label: "vite build", success: true },
      ],
    });
    expect(out).toContain("BUILD OK");
    expect(out).toContain(URL);
  });
});

describe("fallbackVerdict", () => {
  const ctx = { url: URL, buildLogPath: "/home/x/.singularity/worktrees/att-x/build.log" };

  // Narrows Verdict | null and fails loudly instead of papering over with `!`.
  function requireVerdict(v: Verdict | null): Verdict {
    if (v === null) throw new Error("expected a non-null fallback verdict");
    return v;
  }

  test("agreeing (ok:true, exit 0) → null", () => {
    expect(fallbackVerdict({ ok: true }, 0, ctx)).toBeNull();
  });

  test("agreeing (ok:false, exit 1) → null", () => {
    expect(fallbackVerdict({ ok: false }, 1, ctx)).toBeNull();
  });

  test("(no verdict, exit 1) → aborted-before-completing headline, NOT DEPLOYED reason", () => {
    const v = requireVerdict(fallbackVerdict(null, 1, ctx));
    expect(v.headline).toContain("aborted before completing");
    const reason = v.ok ? v.notes : v.reason;
    expect(reason.join("\n")).toContain("NOT DEPLOYED");
  });

  test("(no verdict, exit 0) → This is a bug", () => {
    const v = requireVerdict(fallbackVerdict(null, 0, ctx));
    expect(renderVerdict(v)).toContain("This is a bug");
  });

  test("(ok:false, exit 0) → This is a bug", () => {
    const v = requireVerdict(fallbackVerdict({ ok: false }, 0, ctx));
    expect(renderVerdict(v)).toContain("This is a bug");
  });

  test("(ok:true, exit 3) → This is a bug", () => {
    const v = requireVerdict(fallbackVerdict({ ok: true }, 3, ctx));
    expect(renderVerdict(v)).toContain("This is a bug");
  });

  test("every non-null fallback's rendered last line is the Full output pointer", () => {
    const cases: Array<{ emitted: { ok: boolean } | null; code: number }> = [
      { emitted: null, code: 1 },
      { emitted: null, code: 0 },
      { emitted: { ok: false }, code: 0 },
      { emitted: { ok: true }, code: 3 },
    ];
    for (const { emitted, code } of cases) {
      const v = requireVerdict(fallbackVerdict(emitted, code, ctx));
      const lines = renderVerdict(v).split("\n");
      expect(lines.at(-1)).toBe(`  Full output: ${ctx.buildLogPath}`);
    }
  });
});

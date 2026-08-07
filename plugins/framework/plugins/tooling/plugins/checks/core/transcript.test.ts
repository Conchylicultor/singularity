import { describe, expect, test } from "bun:test";
import { renderOutcomeBlock, type TranscriptOutcome } from "./transcript";

// Pure: no check registry, no filesystem. The transcript's per-check block is a
// contract with whoever reads the file (a human, a grep), so its shape is pinned
// here rather than inferred from a full run.
function outcome(over: Partial<TranscriptOutcome>): TranscriptOutcome {
  return {
    checkId: "some:check",
    result: { ok: true },
    cached: false,
    observations: [],
    ...over,
  };
}

describe("renderOutcomeBlock", () => {
  test("a pass is one line; a cached pass says so", () => {
    expect(renderOutcomeBlock(outcome({}))).toEqual(["• some:check ... ok"]);
    expect(renderOutcomeBlock(outcome({ cached: true }))).toEqual([
      "• some:check ... ok (cached)",
    ]);
  });

  test("observations are indented under the result line, of either stream", () => {
    expect(
      renderOutcomeBlock(
        outcome({
          observations: [
            { line: "maxRSS 1.2 GB", stream: "stdout" },
            { line: "two\nlines", stream: "stderr" },
          ],
        }),
      ),
    ).toEqual(["• some:check ... ok", "  maxRSS 1.2 GB", "  two\n  lines"]);
  });

  test("a failure carries its full message and hint, indented", () => {
    expect(
      renderOutcomeBlock(
        outcome({
          result: { ok: false, message: "bad\nworse", hint: "fix it" },
        }),
      ),
    ).toEqual(["• some:check ... FAIL", "  bad\n  worse", "  hint: fix it"]);
  });

  test("an inconclusive result leads with its first message line, and stays non-FAIL", () => {
    const lines = renderOutcomeBlock(
      outcome({
        result: {
          ok: false,
          inconclusive: true,
          message: "host too loaded\ndetail",
          hint: "retry",
        },
      }),
    );
    expect(lines).toEqual([
      "⚠ some:check ... inconclusive — host too loaded",
      "  host too loaded\n  detail",
      "  hint: retry",
    ]);
  });

  test("a huge message is NOT truncated — that is the console's job, not the file's", () => {
    const message = Array.from({ length: 500 }, (_, i) => `line ${i}`).join(
      "\n",
    );
    const [, body] = renderOutcomeBlock(
      outcome({ result: { ok: false, message } }),
    );
    expect(body?.split("\n")).toHaveLength(500);
    expect(body).toContain("line 499");
  });
});

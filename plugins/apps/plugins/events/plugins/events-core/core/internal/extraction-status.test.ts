import { describe, expect, test } from "bun:test";
import { extractionStatus } from "./extraction-status";

describe("extractionStatus", () => {
  test("no completed run is `never`, whatever the count says", () => {
    // A source created a minute ago. `never` and `empty` must not collapse: one
    // has not been asked, the other answered nothing.
    expect(extractionStatus({ lastOutcome: null, lastEventCount: null })).toBe(
      "never",
    );
  });

  test("a successful extraction with events is `ok`", () => {
    expect(
      extractionStatus({ lastOutcome: "extracted", lastEventCount: 12 }),
    ).toBe("ok");
  });

  test("a successful extraction that found nothing is `empty`, not `ok`", () => {
    expect(
      extractionStatus({ lastOutcome: "extracted", lastEventCount: 0 }),
    ).toBe("empty");
  });

  test("an unchanged run keeps the last extraction's `empty`", () => {
    // The page has not moved since the extraction that found nothing, so the
    // source is still empty — a cheap cache-hit run must not report `ok`.
    expect(
      extractionStatus({ lastOutcome: "unchanged", lastEventCount: 0 }),
    ).toBe("empty");
  });

  test("an unchanged run keeps the last extraction's `ok`", () => {
    expect(
      extractionStatus({ lastOutcome: "unchanged", lastEventCount: 7 }),
    ).toBe("ok");
  });

  test("a failure wins over the good extraction it followed", () => {
    // `lastEventCount` still holds the last extraction's count (a failed run
    // leaves it alone on purpose), and it must not outrank the newer failure:
    // the question is the current state, not the best one on record.
    expect(
      extractionStatus({ lastOutcome: "failed", lastEventCount: 12 }),
    ).toBe("failed");
  });

  test("a failure before any extraction is still `failed`", () => {
    expect(
      extractionStatus({ lastOutcome: "failed", lastEventCount: null }),
    ).toBe("failed");
  });

  test("a count-less unchanged run is answered, not crashed", () => {
    // Unreachable in practice — the first run always extracts, because a null
    // `lastFingerprint` can never be a cache hit — but a status column is not
    // worth throwing over an impossible row.
    expect(
      extractionStatus({ lastOutcome: "unchanged", lastEventCount: null }),
    ).toBe("ok");
  });
});

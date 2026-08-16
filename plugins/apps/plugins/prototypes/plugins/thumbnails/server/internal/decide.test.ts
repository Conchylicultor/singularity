import { describe, expect, test } from "bun:test";
import { classifyRenderOutcome, decideThumbnail } from "./decide";

const KEY = "a".repeat(64);
const OTHER_KEY = "b".repeat(64);

describe("decideThumbnail", () => {
  test("a cached fingerprint is ready and renders nothing", () => {
    expect(decideThumbnail(KEY, true, undefined)).toEqual({
      state: { status: "ready", key: KEY },
      render: false,
    });
  });

  test("an uncached fingerprint renders", () => {
    expect(decideThumbnail(KEY, false, undefined)).toEqual({
      state: { status: "rendering" },
      render: true,
    });
  });

  test("a failure at these exact bytes is kept, not retried", () => {
    const failed = {
      status: "failed",
      key: KEY,
      kind: "blank-page",
      message: "helix rendered an empty page",
    } as const;

    expect(decideThumbnail(KEY, false, failed)).toEqual({
      state: failed,
      render: false,
    });
  });

  test("a failure at OTHER bytes gets a fresh attempt", () => {
    const failed = {
      status: "failed",
      key: OTHER_KEY,
      kind: "blank-page",
      message: "helix rendered an empty page",
    } as const;

    expect(decideThumbnail(KEY, false, failed)).toEqual({
      state: { status: "rendering" },
      render: true,
    });
  });

  test("a cached fingerprint wins over a stale failure", () => {
    const failed = {
      status: "failed",
      key: KEY,
      kind: "subresource-failed",
      message: "…",
    } as const;

    expect(decideThumbnail(KEY, true, failed).state).toEqual({
      status: "ready",
      key: KEY,
    });
  });
});

describe("classifyRenderOutcome", () => {
  test("a painted page with no failed requests is worth keeping", () => {
    expect(classifyRenderOutcome("helix", [], true)).toBeNull();
  });

  test("an empty page is rejected as blank", () => {
    const err = classifyRenderOutcome("helix", [], false);
    expect(err?.kind).toBe("blank-page");
  });

  test("a failed script is reported as the cause, not as blankness", () => {
    const err = classifyRenderOutcome(
      "helix",
      ["https://unpkg.com/react.js (net::ERR_NAME_NOT_RESOLVED)"],
      false,
    );
    expect(err?.kind).toBe("subresource-failed");
    expect(err?.message).toContain("unpkg.com/react.js");
  });

  test("a failed script rejects even when the page did paint something", () => {
    const err = classifyRenderOutcome(
      "helix",
      ["https://cdn/x.css (403)"],
      true,
    );
    expect(err?.kind).toBe("subresource-failed");
  });
});

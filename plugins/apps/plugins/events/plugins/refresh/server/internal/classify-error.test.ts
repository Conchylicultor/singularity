import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { classifyRefreshError, isNonRetryable } from "./classify-error";

// The classification decides whether a source is parked in `error` after ONE
// attempt or retried — i.e. whether a broken URL costs one model call or three.

/** A stand-in that reproduces only what the classifier reads: `name`. */
function named(name: string, message: string): Error {
  const err = new Error(message);
  err.name = name;
  return err;
}

function zodError(): unknown {
  const result = z.object({ title: z.string() }).safeParse({});
  if (result.success) throw new Error("fixture should not parse");
  return result.error;
}

describe("classifyRefreshError", () => {
  test("a source type's own permanent failure is terminal", () => {
    const c = classifyRefreshError(named("NonRetryableError", "404 Not Found"));
    expect(c).toMatchObject({ code: "source", terminal: true });
    expect(c.message).toBe("404 Not Found");
  });

  test("an SSRF refusal is terminal — no retry reaches a public address", () => {
    expect(
      classifyRefreshError(named("SsrfError", "resolves to a private address")),
    ).toMatchObject({ code: "blocked_url", terminal: true });
  });

  test("a bot challenge is terminal — a browser already failed to clear it", () => {
    // The exception to transient-by-default: the source type raises this only
    // after trying the one client that could have read the page (or after the
    // user pinned it to plain), so what is left is the site's standing policy.
    expect(
      classifyRefreshError(
        named(
          "BotChallengeError",
          "This page answers automated requests with a bot challenge (HTTP 429, x-vercel-mitigated: challenge).",
        ),
      ),
    ).toMatchObject({ code: "bot_challenge", terminal: true });
  });

  test("a bare 429 with no mitigation evidence stays transient", () => {
    // The narrowness IS the safety of the arm above. A plain rate limit is the
    // real 429, it clears on its own, and classifying it terminal would park a
    // healthy source the moment a site throttled us for a minute. Nothing here
    // reads the status — this is pinned by the fact that only the source type
    // (which saw the mitigation header) can mint a `BotChallengeError`.
    expect(
      classifyRefreshError(
        new Error("Page returned 429 fetching https://example.com/"),
      ),
    ).toMatchObject({ code: "unknown", terminal: false });
  });

  test("a malformed extraction is terminal, not retried three times", () => {
    expect(classifyRefreshError(zodError())).toMatchObject({
      code: "extraction",
      terminal: true,
    });
  });

  test("an uninstalled source type is terminal config", () => {
    expect(
      classifyRefreshError(named("UnknownSourceTypeError", 'no type "url"')),
    ).toMatchObject({ code: "config", terminal: true });
  });

  test("an unrecognised failure is assumed transient", () => {
    // Guessing transient costs at most `maxAttempts` retries; guessing terminal
    // would park a healthy source until a human noticed.
    expect(classifyRefreshError(new Error("socket hang up"))).toMatchObject({
      code: "unknown",
      terminal: false,
    });
  });

  test("a non-Error throw still classifies", () => {
    expect(classifyRefreshError("boom")).toMatchObject({
      code: "unknown",
      message: "boom",
      terminal: false,
    });
    expect(classifyRefreshError(undefined).message).toBe("undefined");
  });

  test("the message is trimmed to a single readable value", () => {
    const c = classifyRefreshError(new Error(`  ${"x".repeat(500)}  `));
    expect(c.message.length).toBe(300);
    expect(c.message.endsWith("…")).toBe(true);
  });
});

describe("isNonRetryable", () => {
  test("matches by name, so a duplicated module identity cannot defeat it", () => {
    expect(isNonRetryable(named("NonRetryableError", "x"))).toBe(true);
    expect(isNonRetryable(new Error("x"))).toBe(false);
    expect(isNonRetryable(null)).toBe(false);
  });
});

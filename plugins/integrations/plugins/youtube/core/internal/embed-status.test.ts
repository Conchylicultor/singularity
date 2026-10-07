import { describe, expect, test } from "bun:test";
import {
  statusFromOembedCode,
  statusFromPlayerCode,
  type EmbedStatus,
} from "./embed-status";

describe("statusFromOembedCode", () => {
  // Every code measured on 720 video ids from the Hooktheory dump (2026-09-17/18).
  const decided: [number, EmbedStatus][] = [
    [200, "ok"],
    [404, "gone"],
    // Not a video id at all ("cheerleader"): nothing will ever play there.
    [400, "gone"],
    [403, "not-embeddable"],
    [401, "not-embeddable"],
  ];
  test.each(decided)("%i → %s", (code, status) => {
    expect(statusFromOembedCode(code)).toEqual({ kind: "decided", status });
  });

  // Throttling and server faults say nothing about the video: it stays unknown.
  test.each([429, 500, 503, 302])("%i is undecided", (code) => {
    expect(statusFromOembedCode(code)).toEqual({ kind: "undecided" });
  });
});

describe("statusFromPlayerCode", () => {
  const decided: [number, EmbedStatus][] = [
    [100, "gone"],
    [101, "not-embeddable"],
    [150, "not-embeddable"],
  ];
  test.each(decided)("%i → %s", (code, status) => {
    expect(statusFromPlayerCode(code)).toEqual({ kind: "decided", status });
  });

  // 2 is an invalid parameter (the caller's bug) and 5 an HTML5 player fault:
  // neither says anything about the video, so neither counts as a refusal.
  test.each([2, 5, 0, 404])("%i is undecided", (code) => {
    expect(statusFromPlayerCode(code)).toEqual({ kind: "undecided" });
  });
});

import { describe, expect, test } from "bun:test";
import { mapDuressEpisodes, MAX_OPEN_EPISODE_MS } from "./duress-map";
import type { DuressLineLike } from "./duress-map";

const T0 = Date.parse("2026-07-11T03:00:00.000Z");
const fromMs = T0;
const toMs = T0 + 60 * 60 * 1000;

const trip = (episodeSetAt: number, reason = "decompressions"): DuressLineLike => ({
  atMs: episodeSetAt,
  kind: "trip",
  reason,
  episodeSetAt,
});
const clear = (episodeSetAt: number, atMs: number, reason = "decompressions"): DuressLineLike => ({
  atMs,
  kind: "clear",
  reason,
  episodeSetAt,
});

describe("mapDuressEpisodes", () => {
  test("a trip + clear pair maps to the exact interval", () => {
    const setAt = T0 + 29 * 60_000;
    const clearedAt = setAt + 14 * 60_000;
    const [ev] = mapDuressEpisodes([trip(setAt), clear(setAt, clearedAt)], fromMs, toMs);
    expect(ev).toEqual({
      id: `duress:${setAt}`,
      source: "duress",
      worktree: "host",
      startMs: setAt,
      endMs: clearedAt,
      label: "duress: decompressions",
      severity: "warning",
      detail: {
        reason: "decompressions",
        episodeSetAt: setAt,
        clearedAtMs: clearedAt,
        clearReason: "decompressions",
      },
    });
  });

  test("a clear line alone fully determines its interval (trip predates the read window)", () => {
    const setAt = fromMs - 10 * 60_000;
    const clearedAt = fromMs + 5 * 60_000;
    const [ev] = mapDuressEpisodes(
      [clear(setAt, clearedAt, "max-episode-hold: locks")],
      fromMs,
      toMs,
    );
    expect(ev).toMatchObject({
      startMs: setAt,
      endMs: clearedAt,
      label: "duress: max-episode-hold: locks",
    });
  });

  test("a recent unpaired trip renders open-ended to toMs with the in-flight pulse", () => {
    const setAt = toMs - 5 * 60_000;
    const [ev] = mapDuressEpisodes([trip(setAt)], fromMs, toMs);
    expect(ev).toMatchObject({
      startMs: setAt,
      endMs: toMs,
      detail: { open: true, endUnknown: false, inFlight: true },
    });
  });

  test("a stale unpaired trip (lapse — no clear line) is bounded, never still-open forever", () => {
    const setAt = fromMs + 5 * 60_000; // 55 min before toMs > MAX_OPEN_EPISODE_MS
    const [ev] = mapDuressEpisodes([trip(setAt)], fromMs, toMs);
    expect(ev).toMatchObject({
      startMs: setAt,
      endMs: setAt + MAX_OPEN_EPISODE_MS,
      detail: { open: false, endUnknown: true, inFlight: false },
    });
  });

  test("an unpaired trip superseded by a later episode is bounded by that episode's start", () => {
    const first = fromMs + 5 * 60_000;
    const second = first + 10 * 60_000;
    const events = mapDuressEpisodes(
      [trip(first, "locks"), trip(second), clear(second, second + 60_000)],
      fromMs,
      toMs,
    );
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      startMs: first,
      endMs: second,
      label: "duress: locks",
      detail: { endUnknown: true },
    });
  });

  test("episodes fully outside the window are dropped", () => {
    const setAt = fromMs - 60 * 60_000;
    const events = mapDuressEpisodes([clear(setAt, fromMs - 30 * 60_000)], fromMs, toMs);
    expect(events).toEqual([]);
  });
});

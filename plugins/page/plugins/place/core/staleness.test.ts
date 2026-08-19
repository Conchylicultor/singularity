import { describe, expect, test } from "bun:test";
import {
  PLACE_SNAPSHOT_TTL_MS,
  placeDataFromSnapshot,
  placeNeedsResolve,
  placeSnapshotState,
} from "./staleness";

const NOW = Date.parse("2026-08-18T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

describe("placeSnapshotState", () => {
  test("a block with no name has nothing to render", () => {
    expect(placeSnapshotState({}, NOW)).toBe("missing");
    // An empty string is the same nothing as an absent key: a card whose name
    // is "" renders a blank headline, which is not a rendered snapshot.
    expect(placeSnapshotState({ name: "", fetchedAt: NOW }, NOW)).toBe(
      "missing",
    );
  });

  test("a snapshot stamped just now is fresh", () => {
    expect(placeSnapshotState({ name: "Café", fetchedAt: NOW }, NOW)).toBe(
      "fresh",
    );
  });

  test("a snapshot one day inside the window is still fresh", () => {
    const fetchedAt = NOW - (PLACE_SNAPSHOT_TTL_MS - DAY);
    expect(placeSnapshotState({ name: "Café", fetchedAt }, NOW)).toBe("fresh");
  });

  test("the window closes AT the ttl, not after it", () => {
    // The boundary is the caching term itself, so it must expire exactly on it
    // rather than one millisecond late.
    const fetchedAt = NOW - PLACE_SNAPSHOT_TTL_MS;
    expect(placeSnapshotState({ name: "Café", fetchedAt }, NOW)).toBe("stale");
  });

  test("a snapshot past the window is stale, and keeps its content", () => {
    const fetchedAt = NOW - (PLACE_SNAPSHOT_TTL_MS + DAY);
    // Still not "missing" — the name is there, so the card keeps rendering it
    // while the refresh runs.
    expect(placeSnapshotState({ name: "Café", fetchedAt }, NOW)).toBe("stale");
  });

  test("an unstamped snapshot is stale, never assumed fresh", () => {
    expect(placeSnapshotState({ name: "Café" }, NOW)).toBe("stale");
  });

  test("a stamp from the future is stale, not fresh forever", () => {
    expect(
      placeSnapshotState({ name: "Café", fetchedAt: NOW + 10 * DAY }, NOW),
    ).toBe("stale");
  });
});

describe("placeNeedsResolve", () => {
  test("only a fresh snapshot skips the provider", () => {
    expect(placeNeedsResolve({ name: "Café", fetchedAt: NOW }, NOW)).toBe(
      false,
    );
    expect(placeNeedsResolve({ name: "Café" }, NOW)).toBe(true);
    expect(placeNeedsResolve({}, NOW)).toBe(true);
  });
});

describe("placeDataFromSnapshot", () => {
  test("carries every snapshot field and stamps the clock reading", () => {
    expect(
      placeDataFromSnapshot(
        "demo",
        {
          placeId: "p1",
          name: "Café Kitsuné",
          address: "51 Galerie de Montpensier, Paris",
          category: "Coffee shop",
          mapsUrl: "https://example.test/p1",
          lat: 48.86,
          lng: 2.33,
        },
        NOW,
      ),
    ).toEqual({
      providerId: "demo",
      placeId: "p1",
      name: "Café Kitsuné",
      address: "51 Galerie de Montpensier, Paris",
      category: "Coffee shop",
      mapsUrl: "https://example.test/p1",
      lat: 48.86,
      lng: 2.33,
      fetchedAt: NOW,
    });
  });

  test("a field the provider no longer returns is dropped, not carried over", () => {
    const refreshed = placeDataFromSnapshot(
      "demo",
      { placeId: "p1", name: "Café Kitsuné", address: "Paris" },
      NOW,
    );
    expect(refreshed.category).toBeUndefined();
    expect(refreshed.mapsUrl).toBeUndefined();
  });

  test("the result is immediately fresh", () => {
    const data = placeDataFromSnapshot(
      "demo",
      { placeId: "p1", name: "Café", address: "Paris" },
      NOW,
    );
    expect(placeSnapshotState(data, NOW)).toBe("fresh");
  });
});

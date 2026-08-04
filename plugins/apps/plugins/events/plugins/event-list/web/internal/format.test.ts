import { describe, expect, test } from "bun:test";
import { eventImageSrc, formatEventWhen, formatPlace, urlHost } from "./format";

/** Local-calendar construction (never UTC) — the formatter reads local getters. */
const at = (iso: string): Date => new Date(iso);
const NOW = at("2026-08-03T12:00:00");

describe("formatEventWhen", () => {
  test("timed event in the current year", () => {
    expect(formatEventWhen(at("2026-08-13T21:00:00"), false, NOW)).toBe(
      "Thu 13 Aug · 21:00",
    );
  });

  test("all-day event drops the time", () => {
    expect(formatEventWhen(at("2026-08-13T00:00:00"), true, NOW)).toBe("Thu 13 Aug");
  });

  test("another year is spelled out", () => {
    expect(formatEventWhen(at("2027-01-02T09:05:00"), false, NOW)).toBe(
      "Sat 2 Jan 2027 · 09:05",
    );
  });

  test("an invalid date formats to the empty string, never 'NaN'", () => {
    expect(formatEventWhen(new Date("nope"), false, NOW)).toBe("");
  });
});

describe("formatPlace", () => {
  test("both, one, or neither", () => {
    expect(formatPlace("Fitzroy", "Paris")).toBe("Fitzroy · Paris");
    expect(formatPlace("Fitzroy", null)).toBe("Fitzroy");
    expect(formatPlace(null, "Paris")).toBe("Paris");
    expect(formatPlace(null, null)).toBe(null);
    expect(formatPlace("  ", null)).toBe(null);
  });
});

describe("urlHost", () => {
  test("strips the scheme, path and a leading www.", () => {
    expect(urlHost("https://www.fitzroy-paris.com/soirees")).toBe("fitzroy-paris.com");
    expect(urlHost("https://shotgun.live/events/1")).toBe("shotgun.live");
  });

  test("a non-URL is not a host", () => {
    expect(urlHost("not a url")).toBe(null);
    expect(urlHost("")).toBe(null);
  });
});

describe("eventImageSrc", () => {
  test("an absolute http(s) URL passes through verbatim", () => {
    expect(eventImageSrc("https://cdn.example.test/poster.jpg")).toBe(
      "https://cdn.example.test/poster.jpg",
    );
    expect(eventImageSrc("http://cdn.example.test/poster.jpg")).toBe(
      "http://cdn.example.test/poster.jpg",
    );
  });

  test("no poster, or one the browser must not load, yields no cover", () => {
    expect(eventImageSrc(null)).toBe(null);
    expect(eventImageSrc("")).toBe(null);
    expect(eventImageSrc("/relative/poster.jpg")).toBe(null);
    expect(eventImageSrc("data:image/svg+xml,<svg/>")).toBe(null);
    expect(eventImageSrc("javascript:alert(1)")).toBe(null);
  });
});

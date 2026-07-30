import { describe, expect, test } from "bun:test";
import { loadGoogleFontFamilies } from "./google-font-catalog";

describe("google fonts catalog", () => {
  test("rejects the system fonts that were being requested from Google", async () => {
    const families = await loadGoogleFontFamilies();

    // Every one of these was requested on each boot. Google answers an unknown
    // family with `400 text/html`, which Chromium blocks as an opaque response
    // (ERR_BLOCKED_BY_ORB). `Helvetica Neue` is the exception that still 200s —
    // Google serves it from a restricted URL — but downloading ~90 KB of it to
    // satisfy a stack that meant the *local* copy is equally wrong.
    for (const name of [
      "SFMono-Regular",
      "Liberation Mono",
      "Segoe UI Symbol",
      "Segoe UI Emoji",
      "Apple Color Emoji",
      "Helvetica Neue",
    ]) {
      expect(families.has(name)).toBe(false);
    }
  });

  test("rejects the near-misses the old hand-written denylist let through", async () => {
    const families = await loadGoogleFontFamilies();

    // The denylist held `SF Mono`, `Segoe UI` and `Helvetica`, so each of these
    // slipped past it. Enumerating system font names can never be complete —
    // that is the whole reason this is an allowlist.
    for (const name of [
      "SF Pro Display",
      "Lucida Grande",
      "Palatino Linotype",
      "Book Antiqua",
      "Old English Text MT",
      "MS Sans Serif",
      "Hoefler Text",
      "Source Sans Pro", // renamed to Source Sans 3 — the old name is dead
      "Inter var", // a fontsource local alias, not a Google family
      "Geist Sans", // Vercel's, self-hosted
    ]) {
      expect(families.has(name)).toBe(false);
    }
  });

  test("admits real Google Fonts", async () => {
    const families = await loadGoogleFontFamilies();

    for (const name of [
      "Inter",
      "Roboto",
      "JetBrains Mono",
      "Plus Jakarta Sans",
      "Noto Color Emoji",
      "Geist",
    ]) {
      expect(families.has(name)).toBe(true);
    }
  });

  test("holds the full published catalog", async () => {
    const families = await loadGoogleFontFamilies();
    // ~1,942 at the time of the snapshot. A drastically smaller set means the
    // committed file was truncated.
    expect(families.size).toBeGreaterThan(1000);
  });

  test("memoizes the load", async () => {
    expect(loadGoogleFontFamilies()).toBe(loadGoogleFontFamilies());
  });
});

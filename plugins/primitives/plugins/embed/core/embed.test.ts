import { describe, expect, test } from "bun:test";
import {
  EMBED_PARAM,
  EMBED_VALUES,
  readEmbedMode,
  withEmbedFlag,
} from "./internal/embed";

const ORIGIN = "http://example.localhost:9000";

describe("readEmbedMode", () => {
  test("reads the chromeless flag with or without the leading question mark", () => {
    expect(readEmbedMode("?embed=1")).toBe("chromeless");
    expect(readEmbedMode("embed=1")).toBe("chromeless");
    expect(readEmbedMode("?tab=x&embed=1")).toBe("chromeless");
  });

  test("reads the chrome flag", () => {
    expect(readEmbedMode("?embed=chrome")).toBe("chrome");
    expect(readEmbedMode("?tab=x&embed=chrome")).toBe("chrome");
  });

  test("anything else is not embedded", () => {
    expect(readEmbedMode("")).toBeUndefined();
    expect(readEmbedMode("?tab=x")).toBeUndefined();
    expect(readEmbedMode("?embed=0")).toBeUndefined();
    expect(readEmbedMode("?embed=true")).toBeUndefined();
    expect(readEmbedMode("?embed")).toBeUndefined();
  });
});

describe("withEmbedFlag", () => {
  test("adds the flag to a bare path", () => {
    expect(withEmbedFlag("/agents", ORIGIN, "chromeless")).toBe(
      "/agents?embed=1",
    );
    expect(withEmbedFlag("/agents", ORIGIN, "chrome")).toBe(
      "/agents?embed=chrome",
    );
  });

  test("appends to an existing query instead of opening a second one", () => {
    expect(withEmbedFlag("/agents?tab=x", ORIGIN, "chromeless")).toBe(
      "/agents?tab=x&embed=1",
    );
  });

  test("overwrites a flag the path already carries", () => {
    expect(withEmbedFlag("/agents?embed=0", ORIGIN, "chromeless")).toBe(
      "/agents?embed=1",
    );
    expect(withEmbedFlag("/agents?embed=1", ORIGIN, "chromeless")).toBe(
      "/agents?embed=1",
    );
    expect(withEmbedFlag("/agents?embed=1", ORIGIN, "chrome")).toBe(
      "/agents?embed=chrome",
    );
  });

  test("keeps the hash and never returns the origin", () => {
    expect(withEmbedFlag("/agents/c/1#top", ORIGIN, "chromeless")).toBe(
      "/agents/c/1?embed=1#top",
    );
  });

  test("the result reads back as the mode it was written in", () => {
    for (const mode of ["chromeless", "chrome"] as const) {
      const out = withEmbedFlag("/x?a=b", ORIGIN, mode);
      expect(readEmbedMode(new URL(out, ORIGIN).search)).toBe(mode);
      expect(new URL(out, ORIGIN).searchParams.get(EMBED_PARAM)).toBe(
        EMBED_VALUES[mode],
      );
    }
  });
});

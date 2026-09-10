import { describe, expect, test } from "bun:test";
import {
  EMBED_PARAM,
  EMBED_VALUE,
  hasEmbedFlag,
  withEmbedFlag,
} from "./internal/embed";

const ORIGIN = "http://example.localhost:9000";

describe("hasEmbedFlag", () => {
  test("reads the flag with or without the leading question mark", () => {
    expect(hasEmbedFlag("?embed=1")).toBe(true);
    expect(hasEmbedFlag("embed=1")).toBe(true);
    expect(hasEmbedFlag("?tab=x&embed=1")).toBe(true);
  });

  test("anything else is not embedded", () => {
    expect(hasEmbedFlag("")).toBe(false);
    expect(hasEmbedFlag("?tab=x")).toBe(false);
    expect(hasEmbedFlag("?embed=0")).toBe(false);
    expect(hasEmbedFlag("?embed=true")).toBe(false);
    expect(hasEmbedFlag("?embed")).toBe(false);
  });
});

describe("withEmbedFlag", () => {
  test("adds the flag to a bare path", () => {
    expect(withEmbedFlag("/agents", ORIGIN)).toBe("/agents?embed=1");
  });

  test("appends to an existing query instead of opening a second one", () => {
    expect(withEmbedFlag("/agents?tab=x", ORIGIN)).toBe(
      "/agents?tab=x&embed=1",
    );
  });

  test("overwrites a flag the path already carries", () => {
    expect(withEmbedFlag("/agents?embed=0", ORIGIN)).toBe("/agents?embed=1");
    expect(withEmbedFlag("/agents?embed=1", ORIGIN)).toBe("/agents?embed=1");
  });

  test("keeps the hash and never returns the origin", () => {
    expect(withEmbedFlag("/agents/c/1#top", ORIGIN)).toBe(
      "/agents/c/1?embed=1#top",
    );
  });

  test("the result reads back as embedded", () => {
    const out = withEmbedFlag("/x?a=b", ORIGIN);
    expect(hasEmbedFlag(new URL(out, ORIGIN).search)).toBe(true);
    expect(new URL(out, ORIGIN).searchParams.get(EMBED_PARAM)).toBe(
      EMBED_VALUE,
    );
  });
});

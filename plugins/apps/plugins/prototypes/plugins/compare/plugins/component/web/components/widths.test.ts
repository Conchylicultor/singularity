import { describe, expect, it } from "bun:test";
import { specimenWidths } from "./widths";

describe("specimenWidths", () => {
  it("merges the declared width into the specimen's own, sorted", () => {
    expect(specimenWidths([360, 640], 900)).toEqual([360, 640, 900]);
  });

  it("does not duplicate a declared width the specimen already offers", () => {
    expect(specimenWidths([480, 900], 900)).toEqual([480, 900]);
  });

  it("falls back when the specimen declares none", () => {
    expect(specimenWidths(undefined, 1280)).toEqual([360, 640, 960, 1280]);
    expect(specimenWidths([], 360)).toEqual([360, 640, 960]);
  });
});

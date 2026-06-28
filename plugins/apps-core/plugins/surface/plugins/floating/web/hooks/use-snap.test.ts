import { describe, expect, it } from "bun:test";
import { nextSnapAction, type SnapAction, type SnapZone } from "./use-snap";

const snap = (zone: SnapZone | null): SnapAction => ({ type: "snap", zone });
const MINIMIZE: SnapAction = { type: "minimize" };

describe("nextSnapAction", () => {
  it("tiles a free window to halves / maximize and minimizes on down", () => {
    expect(nextSnapAction(null, "left")).toEqual(snap("left"));
    expect(nextSnapAction(null, "right")).toEqual(snap("right"));
    expect(nextSnapAction(null, "up")).toEqual(snap("maximize"));
    expect(nextSnapAction(null, "down")).toEqual(MINIMIZE);
  });

  it("walks the vertical chain: half ↔ quarter ↔ minimize", () => {
    // left half: up -> top-left, down -> bottom-left
    expect(nextSnapAction("left", "up")).toEqual(snap("top-left"));
    expect(nextSnapAction("left", "down")).toEqual(snap("bottom-left"));
    // back to the half from either quarter
    expect(nextSnapAction("top-left", "down")).toEqual(snap("left"));
    expect(nextSnapAction("bottom-left", "up")).toEqual(snap("left"));
    // top of the chain stays; bottom of the chain minimizes
    expect(nextSnapAction("top-left", "up")).toEqual(snap("top-left"));
    expect(nextSnapAction("bottom-left", "down")).toEqual(MINIMIZE);
  });

  it("toggles halves off and flips quarters horizontally", () => {
    expect(nextSnapAction("left", "right")).toEqual(snap(null)); // restore
    expect(nextSnapAction("right", "left")).toEqual(snap(null));
    expect(nextSnapAction("top-left", "right")).toEqual(snap("top-right"));
    expect(nextSnapAction("bottom-right", "left")).toEqual(snap("bottom-left"));
    // already as far as it goes
    expect(nextSnapAction("left", "left")).toEqual(snap("left"));
    expect(nextSnapAction("top-right", "right")).toEqual(snap("top-right"));
  });

  it("maximize caps the vertical chain: down restores, then minimize", () => {
    expect(nextSnapAction("maximize", "down")).toEqual(snap(null));
    expect(nextSnapAction("maximize", "up")).toEqual(snap("maximize"));
    expect(nextSnapAction("maximize", "left")).toEqual(snap("left"));
    expect(nextSnapAction("maximize", "right")).toEqual(snap("right"));
  });
});

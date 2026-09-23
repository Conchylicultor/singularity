import { describe, expect, it } from "bun:test";
import { layoutFrames, roomPerFrame, sizeForDrag, snapWidth } from "./layout";

describe("roomPerFrame", () => {
  it("shares the width between frames, less padding and gaps", () => {
    expect(roomPerFrame({ w: 1064, h: 900 }, 2)).toEqual({ w: 488, h: 810 });
  });
});

describe("layoutFrames", () => {
  const room = { w: 1000, h: 500 };

  it("Responsive at Fit fills the room at scale 1", () => {
    expect(
      layoutFrames({
        room,
        size: { kind: "responsive" },
        zoom: "fit",
        wholePage: false,
        pageHeight: null,
      }),
    ).toEqual({ width: 1000, height: 500, visibleHeight: 500, scale: 1 });
  });

  it("Responsive at a zoom lays out the room in page pixels", () => {
    expect(
      layoutFrames({
        room,
        size: { kind: "responsive" },
        zoom: 0.5,
        wholePage: false,
        pageHeight: null,
      }),
    ).toEqual({ width: 2000, height: 1000, visibleHeight: 1000, scale: 0.5 });
  });

  it("Responsive + Whole page at Fit zooms out until the tallest page fits", () => {
    const l = layoutFrames({
      room,
      size: { kind: "responsive" },
      zoom: "fit",
      wholePage: true,
      pageHeight: 2000,
    });
    expect(l.scale).toBe(0.25);
    expect(l.visibleHeight).toBe(2000);
  });

  it("a preset at Fit scales to the room's tighter axis", () => {
    const l = layoutFrames({
      room,
      size: { kind: "preset", preset: "Desktop" },
      zoom: "fit",
      wholePage: false,
      pageHeight: null,
    });
    expect(l).toEqual({
      width: 1280,
      height: 800,
      visibleHeight: 800,
      scale: 500 / 800,
    });
  });

  it("a preset with Whole page fits the whole page's height", () => {
    const l = layoutFrames({
      room,
      size: { kind: "preset", preset: "Phone" },
      zoom: "fit",
      wholePage: true,
      pageHeight: 2000,
    });
    expect(l.visibleHeight).toBe(2000);
    expect(l.scale).toBe(0.25);
  });

  it("a fixed zoom is the scale, whatever the room", () => {
    const l = layoutFrames({
      room,
      size: { kind: "custom", w: 700, h: 600 },
      zoom: 1.5,
      wholePage: false,
      pageHeight: null,
    });
    expect(l.scale).toBe(1.5);
    expect(l.width).toBe(700);
  });
});

describe("snapWidth", () => {
  it("snaps within 28px of a preset", () => {
    expect(snapWidth(1010)).toEqual({ width: 1024, preset: "Laptop" });
    expect(snapWidth(900)).toEqual({ width: 900, preset: null });
  });

  it("clamps to the drag range", () => {
    expect(snapWidth(10).width).toBe(360);
    expect(snapWidth(5000).width).toBe(1920);
  });

  it("a drag off the presets is a custom size at the current height", () => {
    expect(sizeForDrag(900, 700)).toEqual({ kind: "custom", w: 900, h: 700 });
    expect(sizeForDrag(470, 700)).toEqual({ kind: "preset", preset: "Phone" });
  });
});

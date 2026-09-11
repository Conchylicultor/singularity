import { describe, expect, it } from "bun:test";
import {
  MAX_SCALE,
  centerOn,
  clampView,
  detailScale,
  fitScale,
  fitView,
  isZoomed,
  minimapRect,
  overflows,
  panView,
  stepScale,
  thumbnailShape,
  viewerArea,
  wheelZoomFactor,
  zoomAt,
  type Area,
  type Size,
  type View,
} from "./view-model";

// A 1440×900 window with the side arrows showing: the room inside the controls
// is 1440 − 2·76 = 1288 wide and 900 − 64 − 76 = 760 tall.
const area: Area = viewerArea(
  { width: 1440, height: 900 },
  { navigable: true },
);
const room = { width: 1288, height: 760 };

const screenshot: Size = { width: 2560, height: 1600 };
const icon: Size = { width: 32, height: 32 };

/** Where on the stage the image pixel `(ix, iy)` is drawn. */
function drawn(view: View, ix: number, iy: number) {
  return { x: view.x + ix * view.scale, y: view.y + iy * view.scale };
}

describe("viewerArea", () => {
  it("keeps clear of the top bar, bottom toolbar and side arrows", () => {
    expect(area).toEqual({
      width: 1440,
      height: 900,
      top: 64,
      bottom: 76,
      side: 76,
    });
  });

  it("uses narrower side insets without arrows, and on a narrow window", () => {
    expect(
      viewerArea({ width: 1440, height: 900 }, { navigable: false }).side,
    ).toBe(32);
    expect(
      viewerArea({ width: 400, height: 800 }, { navigable: true }).side,
    ).toBe(12);
  });
});

describe("fitScale", () => {
  it("shrinks a large image to the room, bounded by the tighter axis", () => {
    expect(fitScale(screenshot, area)).toBeCloseTo(
      Math.min(1288 / 2560, 760 / 1600),
    );
  });

  it("never enlarges an image that already fits", () => {
    expect(fitScale(icon, area)).toBe(1);
    expect(fitScale({ width: 1000, height: 700 }, area)).toBe(1);
  });

  it("leaves room for the controls: the fitted image sits inside the insets", () => {
    const v = fitView(screenshot, area);
    const w = screenshot.width * v.scale;
    const h = screenshot.height * v.scale;
    expect(v.x).toBeGreaterThanOrEqual(area.side - 1e-9);
    expect(v.x + w).toBeLessThanOrEqual(area.width - area.side + 1e-9);
    expect(v.y).toBeGreaterThanOrEqual(area.top - 1e-9);
    expect(v.y + h).toBeLessThanOrEqual(area.height - area.bottom + 1e-9);
  });

  it("stays positive on a stage too small to hold anything", () => {
    expect(
      fitScale(
        screenshot,
        viewerArea({ width: 0, height: 0 }, { navigable: false }),
      ),
    ).toBeGreaterThan(0);
  });
});

describe("clampView", () => {
  it("centres an image smaller than the room, whatever the requested offset", () => {
    const v = clampView({ scale: 1, x: -999, y: 999 }, icon, area);
    expect(v.x).toBe(area.side + (room.width - 32) / 2);
    expect(v.y).toBe(area.top + (room.height - 32) / 2);
  });

  it("never lets a large image be dragged off screen", () => {
    const far = clampView({ scale: 1, x: 5000, y: 5000 }, screenshot, area);
    expect(far.x).toBe(area.side);
    expect(far.y).toBe(area.top);
    const other = clampView({ scale: 1, x: -5000, y: -5000 }, screenshot, area);
    expect(other.x + screenshot.width).toBe(area.width - area.side);
    expect(other.y + screenshot.height).toBe(area.height - area.bottom);
  });

  it("leaves an in-bounds pan alone", () => {
    expect(clampView({ scale: 1, x: -300, y: -200 }, screenshot, area)).toEqual(
      { scale: 1, x: -300, y: -200 },
    );
  });
});

describe("zoomAt", () => {
  it("keeps the image pixel under the pointer fixed", () => {
    const start = fitView(screenshot, area);
    const px = 700;
    const py = 420;
    // The image pixel currently under (px, py).
    const ix = (px - start.x) / start.scale;
    const iy = (py - start.y) / start.scale;
    const z = zoomAt(start, 1, px, py, screenshot, area);
    const p = drawn(z, ix, iy);
    expect(p.x).toBeCloseTo(px);
    expect(p.y).toBeCloseTo(py);
    expect(z.scale).toBe(1);
  });

  it("holds the scale between fit and the maximum", () => {
    const start = fitView(screenshot, area);
    expect(zoomAt(start, 0.001, 700, 400, screenshot, area).scale).toBe(
      fitScale(screenshot, area),
    );
    expect(zoomAt(start, 1000, 700, 400, screenshot, area).scale).toBe(
      MAX_SCALE,
    );
  });

  it("clamps near an edge instead of pulling backdrop into view", () => {
    const start = fitView(screenshot, area);
    const z = zoomAt(start, 1, 0, 0, screenshot, area);
    expect(z.x).toBeLessThanOrEqual(area.side);
    expect(z.y).toBeLessThanOrEqual(area.top);
  });
});

describe("panView", () => {
  it("moves by the drag distance while it stays in bounds, then stops", () => {
    const at = { scale: 1, x: -300, y: -200 };
    expect(panView(at, 50, -20, screenshot, area)).toEqual({
      scale: 1,
      x: -250,
      y: -220,
    });
    expect(panView(at, 10_000, 0, screenshot, area).x).toBe(area.side);
  });
});

describe("detailScale", () => {
  it("is 100% when fitting shrank the image below 80%", () => {
    expect(detailScale(screenshot, area)).toBe(1);
  });

  it("is a whole-number 2–8× enlargement for an image already at real size", () => {
    const s = detailScale(icon, area);
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBe(8); // 60% of the 760px room is far past 8× a 32px icon
    const medium = detailScale({ width: 300, height: 300 }, area);
    expect(medium).toBe(2); // floor(0.6 · 760/300) = 1, raised to the 2× floor
  });

  it("enlarges an image that fit shrank only slightly (fit ≥ 80%)", () => {
    // 0.8 ≤ fit < 1: shown nearly full size, so 100% would reveal nothing.
    const nearly = { width: 1500, height: 900 }; // fit = min(1288/1500, 760/900) ≈ 0.844
    expect(fitScale(nearly, area)).toBeGreaterThanOrEqual(0.8);
    expect(detailScale(nearly, area)).toBe(2);
  });
});

describe("stepScale", () => {
  const fit = 0.475;

  it("zooms in to the next ladder rung", () => {
    expect(stepScale(fit, 1, fit)).toBe(0.5);
    expect(stepScale(1, 1, fit)).toBe(1.5);
    expect(stepScale(MAX_SCALE, 1, fit)).toBe(MAX_SCALE);
  });

  it("zooms out to the previous rung", () => {
    expect(stepScale(1, -1, fit)).toBe(0.75);
    expect(stepScale(0.67, -1, fit)).toBe(0.5);
  });

  it("snaps to fit rather than passing it", () => {
    expect(stepScale(0.5, -1, fit)).toBe(fit);
    expect(stepScale(fit, -1, fit)).toBe(fit);
  });

  it("treats a scale a hair off a rung as on it", () => {
    expect(stepScale(1.0001, 1, fit)).toBe(1.5);
    expect(stepScale(0.9999, -1, fit)).toBe(0.75);
  });
});

describe("isZoomed / overflows", () => {
  it("is not zoomed at fit, zoomed past it", () => {
    const f = fitView(screenshot, area);
    expect(isZoomed(f, screenshot, area)).toBe(false);
    expect(isZoomed({ ...f, scale: 1 }, screenshot, area)).toBe(true);
  });

  it("overflows only once the drawn image is larger than the room", () => {
    expect(overflows(fitView(screenshot, area), screenshot, area)).toBe(false);
    expect(overflows({ scale: 1, x: 0, y: 0 }, screenshot, area)).toBe(true);
    expect(overflows({ scale: 8, x: 0, y: 0 }, icon, area)).toBe(false);
  });
});

describe("minimapRect", () => {
  it("fits the image in the minimap box, keeping its aspect", () => {
    const m = minimapRect({ scale: 1, x: 0, y: 0 }, screenshot, area);
    expect(m.factor).toBeCloseTo(Math.min(168 / 2560, 132 / 1600));
    expect(m.size.width / m.size.height).toBeCloseTo(2560 / 1600);
  });

  it("marks the part of the image on screen", () => {
    // At 100%, panned so the stage's top-left shows image pixel (400, 300).
    const m = minimapRect({ scale: 1, x: -400, y: -300 }, screenshot, area);
    const k = m.factor;
    expect(m.viewport.left).toBeCloseTo(400 * k);
    expect(m.viewport.top).toBeCloseTo(300 * k);
    expect(m.viewport.width).toBeCloseTo(1440 * k);
    expect(m.viewport.height).toBeCloseTo(900 * k);
  });

  it("clips the marked part to the image", () => {
    const m = minimapRect({ scale: 1, x: 76, y: 64 }, screenshot, area);
    expect(m.viewport.left).toBe(0);
    expect(m.viewport.top).toBe(0);
    expect(m.viewport.left + m.viewport.width).toBeLessThanOrEqual(
      m.size.width + 1e-9,
    );
  });

  it("centreOn brings an image pixel to the room's centre", () => {
    const v = centerOn({ scale: 1, x: 0, y: 0 }, 1280, 800, screenshot, area);
    const p = drawn(v, 1280, 800);
    expect(p.x).toBeCloseTo(area.width / 2);
    expect(p.y).toBeCloseTo((area.top + area.height - area.bottom) / 2);
  });
});

describe("wheelZoomFactor", () => {
  const wheel = { deltaMode: 0, ctrlKey: false, metaKey: false };

  it("zooms in on a wheel up, out on a wheel down", () => {
    expect(wheelZoomFactor({ ...wheel, deltaY: -100 })).toBeGreaterThan(1);
    expect(wheelZoomFactor({ ...wheel, deltaY: 100 })).toBeLessThan(1);
  });

  it("zooms faster for a pinch (ctrlKey) or ⌘-scroll", () => {
    expect(
      wheelZoomFactor({ ...wheel, deltaY: -10, ctrlKey: true }),
    ).toBeCloseTo(Math.exp(0.1));
    expect(
      wheelZoomFactor({ ...wheel, deltaY: -10, metaKey: true }),
    ).toBeCloseTo(Math.exp(0.1));
    expect(wheelZoomFactor({ ...wheel, deltaY: -10 })).toBeCloseTo(
      Math.exp(0.022),
    );
  });

  it("treats line-mode deltas as 16px lines", () => {
    expect(wheelZoomFactor({ ...wheel, deltaMode: 1, deltaY: -1 })).toBeCloseTo(
      wheelZoomFactor({ ...wheel, deltaY: -16 }),
    );
  });
});

describe("thumbnailShape", () => {
  it("classifies icons, full-page screenshots and everything else", () => {
    expect(thumbnailShape({ width: 32, height: 32 })).toBe("tiny");
    expect(thumbnailShape({ width: 64, height: 64 })).toBe("tiny");
    expect(thumbnailShape({ width: 65, height: 40 })).toBe("normal");
    expect(thumbnailShape({ width: 1280, height: 5200 })).toBe("tall");
    expect(thumbnailShape({ width: 1000, height: 2200 })).toBe("normal");
    expect(thumbnailShape({ width: 2560, height: 1600 })).toBe("normal");
  });
});

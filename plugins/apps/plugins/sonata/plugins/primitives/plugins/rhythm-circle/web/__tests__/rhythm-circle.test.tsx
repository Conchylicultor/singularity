import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, render, fireEvent } from "@testing-library/react";
import { createRef } from "react";
import { RhythmCircle, type RhythmCircleHandle } from "../index";

afterEach(cleanup);

const TRACKS = [
  { id: "bass", subdivisions: 8, onsets: [0, 3, 6] },
  { id: "chord", subdivisions: 16, onsets: [0, 3, 6, 10, 13] },
] as const;

/** Every bead is a <circle> carrying data-onset; the ring strokes / hub are not. */
function beads(root: ParentNode): SVGCircleElement[] {
  return Array.from(root.querySelectorAll<SVGCircleElement>("circle[data-onset]"));
}

describe("RhythmCircle", () => {
  it("renders one ring per track with subdivisions beads each", () => {
    const { container } = render(<RhythmCircle tracks={TRACKS} />);
    expect(beads(container)).toHaveLength(8 + 16);
  });

  it("marks onset beads as filled (data-onset=true)", () => {
    const { container } = render(<RhythmCircle tracks={[TRACKS[0]]} />);
    const onsetCount = beads(container).filter(
      (b) => b.getAttribute("data-onset") === "true",
    ).length;
    expect(onsetCount).toBe(TRACKS[0].onsets.length);
  });

  it("fires onToggleOnset with (trackId, index) on bead click", () => {
    const onToggle = vi.fn();
    const { container } = render(
      <RhythmCircle tracks={[TRACKS[0]]} onToggleOnset={onToggle} />,
    );
    const bead5 = beads(container)[5]!;
    expect(bead5.getAttribute("role")).toBe("button");
    fireEvent.click(bead5);
    expect(onToggle).toHaveBeenCalledWith("bass", 5);
  });

  it("is presentational (no button role) when onToggleOnset is absent", () => {
    const { container } = render(<RhythmCircle tracks={TRACKS} />);
    expect(beads(container).some((b) => b.hasAttribute("role"))).toBe(false);
  });

  it("setPhase lights the swept onset bead without re-rendering", () => {
    const ref = createRef<RhythmCircleHandle>();
    const { container } = render(
      <RhythmCircle ref={ref} tracks={[TRACKS[0]]} />,
    );
    // Onset 3 of 8 pulses ⇒ phase 3/8 lands the needle on bead index 3.
    ref.current!.setPhase(3 / 8);
    const active = beads(container).filter(
      (b) => b.getAttribute("data-active") === "true",
    );
    expect(active).toHaveLength(1);
    expect(active[0]!.getAttribute("data-onset")).toBe("true");
  });
});

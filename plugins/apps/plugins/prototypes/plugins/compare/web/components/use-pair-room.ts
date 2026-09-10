import { useRef, useState, type RefObject } from "react";
import { useResizeObserver } from "@plugins/primitives/plugins/dom/plugins/element-size/web";
import type { PairFitInput } from "../fit-pair";

/** What the stage measures, so `fitPair` has real numbers to divide. */
export type PairRoom = Pick<PairFitInput, "room" | "band" | "gap">;

export interface PairRoomRefs {
  /** The box the pair may fill — the stage's inner area, padding already off. */
  roomRef: RefObject<HTMLElement | null>;
  /** The container holding both halves; its gap is the space between them. */
  pairRef: RefObject<HTMLElement | null>;
  /** One half, label row included. */
  halfRef: RefObject<HTMLElement | null>;
  /** That half's frame — everything in it zooms. */
  frameRef: RefObject<HTMLElement | null>;
}

/**
 * Measures the room the compare pair may fill and the chrome that does not zoom.
 *
 * The label band is read as "half minus its frame" rather than from a token, so
 * it stays right under any density preset, and it does not change with the zoom
 * (the frame is what scales). The gap is the pair container's own computed gap.
 * Nothing measured here depends on the zoom it feeds, so there is no loop: a
 * re-fit resizes the half and frame by the same amount and the band reads back
 * unchanged.
 *
 * `null` until the first measure, which runs synchronously before paint.
 */
export function usePairRoom(): PairRoomRefs & { measured: PairRoom | null } {
  const room = useRef<HTMLElement | null>(null);
  const pair = useRef<HTMLElement | null>(null);
  const half = useRef<HTMLElement | null>(null);
  const frame = useRef<HTMLElement | null>(null);
  const [measured, setMeasured] = useState<PairRoom | null>(null);

  useResizeObserver([room, half, frame], () => {
    const roomEl = room.current;
    const pairEl = pair.current;
    const halfEl = half.current;
    const frameEl = frame.current;
    if (!roomEl || !pairEl || !halfEl || !frameEl) return;
    const gap = parseFloat(getComputedStyle(pairEl).rowGap);
    if (Number.isNaN(gap)) {
      throw new Error(
        "prototype compare: the pair container has no gap to measure",
      );
    }
    const next: PairRoom = {
      room: { width: roomEl.clientWidth, height: roomEl.clientHeight },
      band: halfEl.offsetHeight - frameEl.offsetHeight,
      gap,
    };
    setMeasured((prev) =>
      prev !== null &&
      prev.room.width === next.room.width &&
      prev.room.height === next.room.height &&
      prev.band === next.band &&
      prev.gap === next.gap
        ? prev
        : next,
    );
  });

  return {
    roomRef: room,
    pairRef: pair,
    halfRef: half,
    frameRef: frame,
    measured,
  };
}

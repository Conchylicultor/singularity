import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * How big the frame a prototype renders in is:
 *
 * - `fixed` — the prototype's declared `prototype-viewport`, scaled to fit.
 * - `page` — the declared viewport's width, and as tall as the page's whole
 *   document, scaled to fit — so all of a scrolling page shows zoomed out, with
 *   nothing to scroll.
 * - `mobile` — a phone-sized canvas ({@link MOBILE_VIEWPORT}), scaled to fit.
 * - `full` — the frame is exactly the space it is given, at scale 1, so the
 *   prototype's own responsive layout decides what it looks like.
 */
export type FrameSize = "fixed" | "page" | "mobile" | "full";

/** Every size, in picker order. */
export const FRAME_SIZES: readonly FrameSize[] = [
  "fixed",
  "page",
  "mobile",
  "full",
];

/** What each size's chip reads. */
export const FRAME_SIZE_LABELS: Record<FrameSize, string> = {
  fixed: "Fixed",
  page: "Whole page",
  mobile: "Mobile",
  full: "Full",
};

/** The `mobile` canvas: a common phone's CSS viewport. */
export const MOBILE_VIEWPORT = { w: 390, h: 844 } as const;

/** The frame size in force, and how to change it. */
export interface FrameSizeChoice {
  size: FrameSize;
  setSize: (size: FrameSize) => void;
}

const FrameSizeContext = createContext<FrameSizeChoice | null>(null);

/**
 * Scopes a frame-size choice to what it wraps. The detail pane provides its own
 * (around a stage that renders through it); a presentation nests a second one
 * that starts at `full`, so presenting fills the screen without touching the
 * size the pane was left on.
 */
export function FrameSizeProvider({
  value,
  children,
}: {
  value: FrameSizeChoice;
  children: ReactNode;
}) {
  return (
    <FrameSizeContext.Provider value={value}>
      {children}
    </FrameSizeContext.Provider>
  );
}

/** A frame-size choice held in local state, starting at `initial`. */
export function useFrameSizeState(initial: FrameSize): FrameSizeChoice {
  const [size, setSize] = useState<FrameSize>(initial);
  return useMemo(() => ({ size, setSize }), [size]);
}

/**
 * The nearest frame-size choice — `null` where nothing renders through one
 * (e.g. the Compare stage, which sizes its frames with its own width control),
 * so the options picker offers the Size row only where it does something.
 */
export function useFrameSizeChoice(): FrameSizeChoice | null {
  return useContext(FrameSizeContext);
}

/** The frame size in force. Throws outside a {@link FrameSizeProvider}. */
export function useFrameSize(): FrameSize {
  const choice = useContext(FrameSizeContext);
  if (!choice) {
    throw new Error("useFrameSize must be used within a FrameSizeProvider");
  }
  return choice.size;
}

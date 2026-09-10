import type { ReactNode } from "react";
import type { PrototypeMeta } from "@plugins/apps/plugins/prototypes/plugins/files/core";

/**
 * A width list typed as what it is: never empty. A kind resolves to at least
 * one width, so everything downstream reads `widths[0]` as a plain number.
 */
export type WidthChoices = readonly [number, ...number[]];

/**
 * What a kind answers with.
 *
 * Every arm is a state the stage RENDERS — including `loading`, which is why
 * there is no "resolved to nothing yet" hole a kind could fill with what "no
 * counterpart" would look like.
 */
export type CounterpartResolution =
  | { status: "loading"; label?: string }
  | { status: "unresolved"; title: ReactNode; detail: ReactNode }
  | {
      status: "found";
      /**
       * The widths THIS counterpart has something to say about. The stage
       * offers exactly these, for BOTH halves.
       */
      widths: WidthChoices;
      /** Heading over the counterpart half ("App component" / "App screen"). */
      title: string;
      /** Caption under it (fixture dims / the resolved route). */
      subtitle?: string;
      /** Identifier chip for the header (the ref, as declared). */
      badge?: string;
      /** Paint the counterpart at `width`. Called inside a PluginErrorBoundary. */
      render: (width: number) => ReactNode;
    };

/**
 * What a kind is handed. A kind is a real component — it may run hooks (load a
 * catalog, read the app registry) and it mounts inside the dispatch middleware's
 * error boundary — but its only output is `children(resolution)`: it paints no
 * layout of its own, so the shared-width invariant lives in one place.
 */
export interface CounterpartKindProps {
  /** The tag before the colon — the dispatch key. */
  kind: string;
  /**
   * Everything after the first colon, trimmed, non-empty. (Not `ref`: that
   * name collides with React's `RefAttributes` on a `ComponentType`.)
   */
  target: string;
  meta: PrototypeMeta;
  /** Hand the stage the resolution. */
  children: (resolution: CounterpartResolution) => ReactNode;
}

/** The non-render fields every kind declares about itself. */
export interface CounterpartKindMeta {
  /** Heading for this kind of counterpart, e.g. "App component". */
  label: string;
  /**
   * A COMPLETE example `content` value, e.g.
   * `fixture:control-panel/setting-rail`. The "declares nothing" copy lists
   * every registered kind's example, so the syntax the reader is shown is the
   * registry's, never a hardcoded pair.
   */
  example: string;
}

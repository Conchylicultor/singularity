import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLatestRef } from "@plugins/primitives/plugins/latest-ref/web";
import { SonataPlayer } from "./slots";

/**
 * Vertical-zoom ("spread") clamp for the piano roll — how tall the falling
 * notes render. Ephemeral view state (the persisted default lives in
 * `pianoRollConfig.spread`); the display threads it through its geometry.
 */
const MIN_SPREAD = 0.4;
const MAX_SPREAD = 3;

/**
 * A player's view state: which display lens it shows and the roll's zoom —
 * display state shared between header controls (the display picker, the
 * spread wheel) and the body (the display itself), per player scope.
 */
export interface PlayerView {
  /**
   * The display lens on screen: the explicit pick, else the default (or
   * first) contributed lens; `null` only when no display is contributed. The
   * render host, the picker and the view-options filter all read this one
   * value, so none of them ever filters on "no pick yet".
   */
  displayId: string | null;
  /** Pick the display lens (`null` returns to the default). */
  setDisplay: (id: string | null) => void;
  /**
   * Piano-roll vertical zoom (1 = base). Ephemeral, live-adjustable display
   * state shared between the header's spread control and the renderer — like
   * the tempo scale, but it scales note HEIGHTS too (the Synthesia "taller
   * notes" zoom). The persisted default lives in `pianoRollConfig.spread`; the
   * piano-roll seeds this from it on load and writes back on commit.
   */
  spread: number;
  /**
   * Live clamp for {@link spread}. `spreadMax` is constant; `spreadMin` is
   * DYNAMIC — the renderer lowers it (via {@link setSpreadFloor}) to the "fit
   * the whole song" zoom so the user can keep zooming out until the entire
   * song is visible. The header wheel reads this range so a full sweep always
   * spans exactly what's reachable.
   */
  spreadMin: number;
  spreadMax: number;
  /** Set the zoom (clamped to [{@link spreadMin}, {@link spreadMax}]).
   *  Continuous — no rounding — so a jog-wheel / pinch drag stays smooth. */
  setSpread: (spread: number) => void;
  /** Lower the live zoom-out floor ({@link spreadMin}) to the renderer-computed
   *  "fit the whole song" spread. Capped at the default floor — long songs lower
   *  it (so you can zoom out until everything fits), short songs keep the default.
   *  The renderer is the sole caller: it alone measures the lane height. */
  setSpreadFloor: (min: number) => void;
  /**
   * Whether this player is on screen: at least one `PlayerDisplay` is mounted
   * in it. Gates the `SonataPlayer.Effect` mount (the keyboard transport).
   */
  shown: boolean;
}

const PlayerViewContext = createContext<PlayerView | null>(null);

/** Read the player's view state. Throws outside a player scope. */
export function usePlayerView(): PlayerView {
  const ctx = useContext(PlayerViewContext);
  if (!ctx) {
    throw new Error("usePlayerView must be used within <SonataPlayerScope>");
  }
  return ctx;
}

/** Mark-shown registration, separate from {@link PlayerView} so only the
 *  player's own `PlayerDisplay` marks it (not on the barrel). */
const MarkShownContext = createContext<(() => () => void) | null>(null);

/**
 * Count the calling component as showing this player for as long as it is
 * mounted (`PlayerDisplay` calls it). Throws outside a player scope.
 */
export function useMarkPlayerShown(): void {
  const markShown = useContext(MarkShownContext);
  if (!markShown) {
    throw new Error("PlayerDisplay must be used within <SonataPlayerScope>");
  }
  useEffect(() => markShown(), [markShown]);
}

export function PlayerViewProvider({ children }: { children: ReactNode }) {
  const displays = SonataPlayer.Display.useContributions();
  // The user's explicit pick (null = "no pick yet, fall back to the default").
  // The effective lens is derived in render, not mirrored into state, so there
  // is never a frame where no lens is selected.
  const [pickedDisplayId, setPickedDisplayId] = useState<string | null>(null);
  const displayId =
    pickedDisplayId ??
    (displays.find((d) => d.default) ?? displays[0])?.id ??
    null;

  // Seeded from pianoRollConfig.spread by the display on load; the 1 here is a
  // pre-seed placeholder for the brief first frame.
  const [spread, setSpreadState] = useState(1);
  // Dynamic zoom-out floor. The renderer lowers it to the "fit whole song" spread
  // (see setSpreadFloor); long songs push it below MIN_SPREAD so the user can zoom
  // out until the entire song is visible. Read through a ref so the stable
  // setSpread callback always clamps against the current floor.
  const [spreadMin, setSpreadMinState] = useState(MIN_SPREAD);
  const spreadMinRef = useLatestRef(spreadMin);

  // Continuous (like the tempo scrub) so a jog-wheel / pinch drag is smooth; the
  // persisted config field carries the tidy step for the settings editor.
  // Clamps against the live (dynamic) floor so zoom-out can reach "fit the song".
  const setSpread = useCallback((next: number) => {
    setSpreadState(Math.max(spreadMinRef.current, Math.min(MAX_SPREAD, next)));
  }, []);

  // The renderer feeds the "fit whole song" floor; cap at the default (short
  // songs already fit well above it) and reject non-positive / non-finite input.
  const setSpreadFloor = useCallback((min: number) => {
    setSpreadMinState(
      Number.isFinite(min) && min > 0 ? Math.min(MIN_SPREAD, min) : MIN_SPREAD,
    );
  }, []);

  // When the floor rises again (shorter song, slower tempo), an earlier-written
  // raw `spread` may fall below the new reachable minimum. Re-clamp into
  // [floor, MAX] in render rather than via an effect that re-writes the state —
  // so the wheel/renderer never show a value below the reachable minimum and
  // there's no extra render cycle. `spread` state still holds the user's intent;
  // `setSpread` clamps against the floor at write time (this handles a *later*
  // floor rise).
  const effectiveSpread = Math.max(spreadMin, Math.min(MAX_SPREAD, spread));

  // How many `PlayerDisplay`s are mounted — a count, not a flag, so two displays
  // of one player (and one unmounting while another mounts) keep it shown.
  const [shownCount, setShownCount] = useState(0);
  const markShown = useCallback(() => {
    setShownCount((n) => n + 1);
    return () => setShownCount((n) => n - 1);
  }, []);
  const shown = shownCount > 0;

  const value = useMemo<PlayerView>(
    () => ({
      displayId,
      setDisplay: setPickedDisplayId,
      spread: effectiveSpread,
      spreadMin,
      spreadMax: MAX_SPREAD,
      setSpread,
      setSpreadFloor,
      shown,
    }),
    [displayId, effectiveSpread, spreadMin, setSpread, setSpreadFloor, shown],
  );

  return (
    <MarkShownContext.Provider value={markShown}>
      <PlayerViewContext.Provider value={value}>
        {children}
      </PlayerViewContext.Provider>
    </MarkShownContext.Provider>
  );
}

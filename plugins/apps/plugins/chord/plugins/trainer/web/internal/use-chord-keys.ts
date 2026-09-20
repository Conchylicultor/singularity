import { useMemo, useState } from "react";
import type { ChordToken } from "@plugins/apps/plugins/chord/plugins/song-index/core";
import {
  chordLabel,
  pickPage,
  type ChordDigit,
  type ChordKeyGroup,
} from "@plugins/apps/plugins/chord/plugins/vocabulary/core";
import { useEventCallback } from "@plugins/primitives/plugins/latest-ref/web";
import type { ShortcutDescriptor } from "@plugins/primitives/plugins/shortcuts/web";

// ── Answering with the number keys ───────────────────────────────────────────
//
// The learner presses the number of the chord's root. One chord on that number
// answers straight away. Several — V and V7 are both a 5 — and the press
// instead ARMS that digit: its chords are lit, numbered on their buttons, and
// the next number picks one. Escape drops the pick, and so does every other key
// of the trainer (they call `cancel` first).
//
// **While a digit is armed it owns the number keys.** The plan's own digit
// shortcuts stand down for that stroke and the registered numbers are exactly
// the ones `pickPage` says are in reach — so "the next number means the chord I
// lit" is true of every number key, not only of the ones that happen to hold a
// chord themselves. (It used to be only those, because the second stroke was
// built by mapping over the plan: with chords on 1, 4 and 5, pressing 5 then 3
// did nothing.)
//
// A digit can hold any number of chords. `pickPage` gives the seven keys to the
// first seven, and past that keeps key 7 as the pager — six chords in reach and
// the rest one press away, wrapping. This hook holds only `{ digit, page }`.
//
// The clock does not stop for the second key: a two-stroke answer costs what it
// costs. That is honest, and it is one reason the curriculum keeps the palette
// small.

/** The digit waiting for a second key, and what that key reaches right now. */
export type Picking = {
  digit: ChordDigit;
  /** The chord each number key picks on the page being shown. */
  numbers: ReadonlyMap<ChordToken, ChordDigit>;
  /** The key that shows the next page, or null when every chord is in reach. */
  pager: ChordDigit | null;
};

export type ChordKeys = {
  /** The digit shortcuts, for `useSurfaceShortcuts` (alongside the trainer's own). */
  shortcuts: ShortcutDescriptor[];
  /** The digit waiting for a second key, or null when nothing is waiting. */
  picking: Picking | null;
  /** Drop a waiting pick. Every other key of the trainer calls this first. */
  cancel: () => void;
};

/** Which digit is armed, and how far down its list the second stroke reaches. */
type Armed = { digit: ChordDigit; page: number };

export function useChordKeys(opts: {
  /** The unlocked chords grouped by the key that answers them (`chordKeyPlan`). */
  plan: readonly ChordKeyGroup[];
  onPick: (token: ChordToken) => void;
}): ChordKeys {
  const { plan, onPick } = opts;
  const [armed, setArmed] = useState<Armed | null>(null);

  const pick = useEventCallback(onPick);

  // Derived from the plan, never stored: a chord that is no longer unlocked (an
  // undone step) stops being lit on the spot, with no state to clean up. A
  // digit that left the plan entirely disarms the same way.
  const picking = useMemo<Picking | null>(() => {
    if (armed === null) return null;
    const group = plan.find((g) => g.digit === armed.digit);
    if (group === undefined) return null;
    const { numbers, pager } = pickPage(group.tokens, armed.page);
    return { digit: group.digit, numbers, pager };
  }, [plan, armed]);

  const shortcuts = useMemo<ShortcutDescriptor[]>(() => {
    // Armed: the number keys belong to this digit, and to nothing else on the
    // page. Only keys that pick something are registered, so a number with no
    // chord behind it stays free rather than swallowing the stroke.
    if (picking !== null) {
      const armedKeys: ShortcutDescriptor[] = [];
      for (const [token, key] of picking.numbers) {
        armedKeys.push({
          id: `chord.pick-on-${key}`,
          keys: key,
          label: `Answer ${chordLabel(token).text}`,
          group: "Chord",
          handler: () => {
            setArmed(null);
            pick(token);
          },
        });
      }
      const { pager } = picking;
      if (pager !== null) {
        armedKeys.push({
          id: `chord.pick-more-${pager}`,
          keys: pager,
          label: `More chords on ${picking.digit}`,
          group: "Chord",
          handler: () =>
            setArmed((a) => (a === null ? null : { ...a, page: a.page + 1 })),
        });
      }
      armedKeys.push({
        id: "chord.pick-cancel",
        keys: "escape",
        label: "Drop the chord being picked",
        group: "Chord",
        handler: () => setArmed(null),
      });
      return armedKeys;
    }
    // At rest: one shortcut per digit the plan holds. A digit with one chord
    // answers; a digit with several arms at the first page.
    return plan.map((group) => {
      const only = group.tokens.length === 1 ? group.tokens[0] : undefined;
      return {
        id: `chord.pick-${group.digit}`,
        keys: group.digit,
        label:
          only === undefined
            ? `Choose among ${String(group.tokens.length)} chords on ${group.digit}`
            : `Answer ${chordLabel(only).text}`,
        group: "Chord",
        handler: () => {
          if (only !== undefined) {
            pick(only);
            return;
          }
          setArmed({ digit: group.digit, page: 0 });
        },
      };
    });
  }, [plan, picking, pick]);

  const cancel = useEventCallback(() => setArmed(null));

  return { shortcuts, picking, cancel };
}

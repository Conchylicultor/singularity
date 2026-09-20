import { useMemo, useState } from "react";
import type { ChordToken } from "@plugins/apps/plugins/chord/plugins/song-index/core";
import {
  chordLabel,
  type ChordDigit,
  type ChordKeyGroup,
} from "@plugins/apps/plugins/chord/plugins/vocabulary/core";
import { useEventCallback } from "@plugins/primitives/plugins/latest-ref/web";
import type { ShortcutDescriptor } from "@plugins/primitives/plugins/shortcuts/web";

// ── Answering with the number keys ───────────────────────────────────────────
//
// The learner presses the number of the chord's root. One chord on that number
// answers straight away. Several — V and V7 are both a 5 — and the press
// instead LIGHTS those chords, numbered 1, 2, 3 on their buttons; the next
// number picks one. Escape drops the pick, and so does every other key of the
// trainer (they call `cancel` first).
//
// One shortcut per number does both jobs, so nothing else on the page can hear
// the second stroke: while a number is waiting, every number key means "the
// chord I lit", and otherwise it means "the chord on that number".
//
// A number can light at most as many chords as there are number keys (seven);
// a chord past that is answered by clicking its button. Nothing in the
// curriculum comes close.
//
// The clock does not stop for the second key: a two-stroke answer costs what it
// costs. That is honest, and it is one reason the curriculum keeps the palette
// small.

/** The digit waiting for a second key, and the chords it lit. */
export type Picking = { digit: ChordDigit; tokens: readonly ChordToken[] };

export type ChordKeys = {
  /** The digit shortcuts, for `useSurfaceShortcuts` (alongside the trainer's own). */
  shortcuts: ShortcutDescriptor[];
  /** The digit waiting for a second key, or null when nothing is waiting. */
  picking: Picking | null;
  /** Drop a waiting pick. Every other key of the trainer calls this first. */
  cancel: () => void;
};

export function useChordKeys(opts: {
  /** The unlocked chords grouped by the key that answers them (`chordKeyPlan`). */
  plan: readonly ChordKeyGroup[];
  onPick: (token: ChordToken) => void;
}): ChordKeys {
  const { plan, onPick } = opts;
  const [picking, setPicking] = useState<Picking | null>(null);

  const pick = useEventCallback(onPick);

  // Derived, never stored: a chord that is no longer unlocked (an undone step)
  // stops being lit on the spot, with no state to clean up afterwards.
  const armed =
    picking === null
      ? null
      : (plan.find((g) => g.digit === picking.digit) ?? null);

  const shortcuts = useMemo(() => {
    const digits: ShortcutDescriptor[] = plan.map((group) => {
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
          // A number waiting for its second key owns every number: this one
          // names one of the chords it lit, not the chords on its own number.
          if (armed !== null) {
            setPicking(null);
            const chosen = armed.tokens[Number(group.digit) - 1];
            if (chosen !== undefined) pick(chosen);
            return;
          }
          if (only !== undefined) {
            pick(only);
            return;
          }
          setPicking({ digit: group.digit, tokens: group.tokens });
        },
      };
    });
    if (armed === null) return digits;
    return [
      ...digits,
      {
        id: "chord.pick-cancel",
        keys: "escape",
        label: "Drop the chord being picked",
        group: "Chord",
        handler: () => setPicking(null),
      },
    ];
  }, [plan, armed, pick]);

  const cancel = useEventCallback(() => setPicking(null));

  return { shortcuts, picking: armed, cancel };
}

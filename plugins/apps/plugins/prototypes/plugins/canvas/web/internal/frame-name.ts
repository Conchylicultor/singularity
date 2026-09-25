import {
  humanizeToken,
  pickedValue,
  type PrototypeOption,
  type StoredPicks,
} from "@plugins/apps/plugins/prototypes/plugins/files/core";

/** What naming a prototype frame needs: its document's options and its picks. */
export interface NamedFrame {
  id: number;
  options: readonly PrototypeOption[];
  picks: StoredPicks;
}

/**
 * A prototype frame's name, as its parts ("Mist", "Home", "Avatar"): the values
 * of the first two declared options, plus the value of EVERY other option on
 * which the prototype frames differ — so two frames never carry the same name
 * while showing different things, and a frame alone is named by its two
 * leading options only.
 *
 * Empty for a prototype that declares no option; the caller names it otherwise.
 */
export function frameName(
  target: NamedFrame,
  all: readonly NamedFrame[],
): string[] {
  const parts: string[] = [];
  target.options.forEach((option, i) => {
    if (i >= 2 && !differs(option.name, all)) return;
    parts.push(humanizeToken(pickedValue(option, target.picks)));
  });
  return parts;
}

/** Whether the frames show more than one value of `name` (or some lack it). */
function differs(name: string, all: readonly NamedFrame[]): boolean {
  const values = new Set(
    all.map((f) => {
      const option = f.options.find((o) => o.name === name);
      return option === undefined ? undefined : pickedValue(option, f.picks);
    }),
  );
  return values.size > 1;
}

/** A frame's letter: A for the first frame on the canvas, B for the second… */
export function letterOf(index: number): string {
  return String.fromCharCode(65 + (index % 26));
}

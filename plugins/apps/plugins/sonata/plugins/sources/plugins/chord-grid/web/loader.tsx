/**
 * Chord-grid loader: a text editor for chord symbols + a voicing picker.
 *
 * Authors the grid (e.g. `Amaj9 Am9 (E E6)`) and chooses how chords become notes.
 * Fully **controlled** by the shell's persisted `raw` — there is no local state,
 * so switching the visible source and back never loses what was typed. Every
 * edit emits `{ text, voicingId, octave }` to the shell, which compiles it.
 * Parse problems (unrecognised tokens) are surfaced visibly — never swallowed.
 */

import { cn } from "@plugins/primitives/plugins/ui-kit/web";
import { useMemo } from "react";
import { asChordGridRaw, type ChordGridRaw } from "./compile";
import { parseGrid } from "./parse-grid";
import { VOICINGS } from "./voicings";

interface Props {
  raw?: unknown;
  onRaw: (raw: unknown) => void;
}

const PLACEHOLDER = "Amaj9 Am9 (E E6) (E E6)\nCmaj7 Am7 Dm9 G13";
const MIN_OCTAVE = 1;
const MAX_OCTAVE = 7;

export function ChordGridLoader({ raw, onRaw }: Props) {
  const current = asChordGridRaw(raw);
  const { text, voicingId, octave } = current;

  // Live parse feedback (recognised chord count + skipped tokens).
  const { events, skipped } = useMemo(() => parseGrid(text), [text]);

  const update = (patch: Partial<ChordGridRaw>) => onRaw({ ...current, ...patch });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
            Chord grid
          </span>
          <textarea
            value={text}
            onChange={(e) => update({ text: e.target.value })}
            placeholder={PLACEHOLDER}
            rows={3}
            spellCheck={false}
            className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 font-mono text-body outline-none focus:border-primary"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
            Voicing
          </span>
          <select
            value={voicingId}
            onChange={(e) => update({ voicingId: e.target.value })}
            className="rounded-md border border-border bg-background px-2.5 py-1.5 text-caption outline-none focus:border-primary"
          >
            {VOICINGS.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
            Octave
          </span>
          <input
            type="number"
            min={MIN_OCTAVE}
            max={MAX_OCTAVE}
            value={octave}
            onChange={(e) =>
              update({
                octave: Math.max(
                  MIN_OCTAVE,
                  Math.min(MAX_OCTAVE, Number(e.target.value) || 4),
                ),
              })
            }
            className="w-16 rounded-md border border-border bg-background px-2.5 py-1.5 text-caption outline-none focus:border-primary"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption">
        <span className="text-muted-foreground">
          {events.length} chord{events.length === 1 ? "" : "s"} · each cell is a
          bar · <code className="rounded-md bg-muted px-1">( )</code> share a bar ·{" "}
          <code className="rounded-md bg-muted px-1">.</code> holds the previous
          chord
        </span>
        {skipped.length > 0 ? (
          <span className={cn("text-destructive")} role="alert">
            Unrecognised: {skipped.join(", ")}
          </span>
        ) : null}
      </div>
    </div>
  );
}

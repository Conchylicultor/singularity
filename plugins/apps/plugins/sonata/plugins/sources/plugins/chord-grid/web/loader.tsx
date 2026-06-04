/**
 * Chord-grid loader: a text editor for chord symbols + a voicing picker.
 *
 * Authors the grid (e.g. `| C G | Am F |`) and chooses how chords become notes.
 * Fully **controlled** by the shell's persisted `raw` — there is no local state,
 * so switching the visible source and back never loses what was typed. Every
 * edit emits `{ text, voicingId, octave }` to the shell, which compiles it.
 * Parse problems (unrecognised tokens) are surfaced visibly — never swallowed.
 */

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { parseGrid, type ChordGridRaw } from "./compile";
import { DEFAULT_VOICING_ID, VOICINGS } from "./voicings";

interface Props {
  raw?: unknown;
  onRaw: (raw: unknown) => void;
}

const PLACEHOLDER = "| C G | Am F |\n| Dm7 G7 | Cmaj7 |";
const MIN_OCTAVE = 1;
const MAX_OCTAVE = 7;
const EMPTY: ChordGridRaw = { text: "", voicingId: DEFAULT_VOICING_ID, octave: 4 };

function asRaw(raw: unknown): ChordGridRaw {
  if (raw && typeof raw === "object" && typeof (raw as ChordGridRaw).text === "string") {
    const r = raw as ChordGridRaw;
    return {
      text: r.text,
      voicingId: r.voicingId || DEFAULT_VOICING_ID,
      octave: r.octave ?? 4,
    };
  }
  return EMPTY;
}

export function ChordGridLoader({ raw, onRaw }: Props) {
  const current = asRaw(raw);
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
            className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-primary"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
            Voicing
          </span>
          <select
            value={voicingId}
            onChange={(e) => update({ voicingId: e.target.value })}
            className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary"
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
            className="w-16 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="text-muted-foreground">
          {events.length} chord{events.length === 1 ? "" : "s"} · bars split on{" "}
          <code className="rounded bg-muted px-1">|</code>
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

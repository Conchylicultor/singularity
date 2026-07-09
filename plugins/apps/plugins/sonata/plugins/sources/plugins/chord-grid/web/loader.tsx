/**
 * Chord-grid loader: a text editor for chord symbols.
 *
 * Authors the grid (e.g. `Amaj9 Am9 (E E6)`). Fully **controlled** by the
 * shell's persisted `raw` — there is no local state, so switching the visible
 * source and back never loses what was typed. Every edit emits `{ text }` to the
 * shell, which compiles it. Parse problems (unrecognised tokens) are surfaced
 * visibly — never swallowed. How chords become notes is the global voicing
 * config's concern, not this per-song editor's.
 */

import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useMemo } from "react";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { asChordGridRaw, type ChordGridRaw } from "./compile";
import { parseGrid } from "./parse-grid";

interface Props {
  raw?: unknown;
  onRaw: (raw: unknown) => void;
}

const PLACEHOLDER =
  "# Verse\nAmaj9 Am9 (E E6) (E E6)\nCmaj7 Am7 Dm9 G13";

export function ChordGridLoader({ raw, onRaw }: Props) {
  const current = asChordGridRaw(raw);
  const { text } = current;

  // Live parse feedback (recognised chord count + skipped tokens).
  const { events, skipped } = useMemo(() => parseGrid(text), [text]);

  const update = (patch: Partial<ChordGridRaw>) => onRaw({ ...current, ...patch });

  return (
    <Stack gap="md">
      <Stack as="label" gap="xs">
        <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
          Chord grid
        </span>
        <textarea
          value={text}
          onChange={(e) => update({ text: e.target.value })}
          placeholder={PLACEHOLDER}
          rows={3}
          spellCheck={false}
          className="w-full resize-y rounded-md border border-border bg-background px-md py-sm font-mono text-body outline-none focus:border-primary"
        />
      </Stack>

      {/* eslint-disable-next-line layout/no-adhoc-layout -- asymmetric two-axis wrap gaps (gap-x-md / gap-y-xs) on a wrapping row; no primitive expresses a per-axis gap split */}
      <div className="flex flex-wrap items-center gap-x-md gap-y-xs text-caption">
        <span className="text-muted-foreground">
          {events.length} chord{events.length === 1 ? "" : "s"} · each cell is a
          bar · <code className="rounded-md bg-muted px-xs">( )</code> share a bar ·{" "}
          <code className="rounded-md bg-muted px-xs">.</code> holds the previous
          chord · <code className="rounded-md bg-muted px-xs">#</code> comments
          the rest of the line
        </span>
        {skipped.length > 0 ? (
          <span className={cn("text-destructive")} role="alert">
            Unrecognised: {skipped.join(", ")}
          </span>
        ) : null}
      </div>
    </Stack>
  );
}

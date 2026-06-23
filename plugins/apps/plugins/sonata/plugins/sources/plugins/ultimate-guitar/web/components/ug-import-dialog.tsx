import { useState } from "react";
import {
  Button,
  DialogTitle,
  DialogDescription,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Surface } from "@plugins/primitives/plugins/css/plugins/surface/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import {
  beatToSeconds,
  scoreEndBeat,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { openSongImperative } from "@plugins/apps/plugins/sonata/plugins/library/web";
import { compile } from "../compile";
import { fetchUgTab, createUltimateGuitarSong } from "../../shared/endpoints";

/**
 * Import dialog for the Ultimate Guitar source, rendered INSIDE the
 * imperative-dialog host's `DialogContent` (so it paints its own panel + title).
 *
 * Flow is **fetch-first**: paste a UG URL → fetch the raw `UgTab` → `compile()`
 * it client-side (so the same recognise-gate + timing synthesis the player uses
 * decides the metrics) → derive `durationSec`/`endBeat` → create the song. Only
 * then do we open it. Fetching before creating means a cancel (or a fetch
 * failure) never leaves a half-formed "Untitled" orphan in the library — the
 * song row is written exactly once, with real metadata, after the network
 * round-trip succeeds.
 *
 * Loud-failure posture: any fetch/compile error is surfaced in a `role="alert"`
 * red line, never swallowed and never rethrown out of the click handler (which
 * would crash the dialog mid-import). The user can correct the URL and retry.
 */
export function UgImportDialog({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  // `Button` auto-pends on a promise-returning onClick (spinner + double-click
  // guard), so we return the promise to it rather than void-swallowing it.
  async function importTab() {
    const trimmed = url.trim();
    if (trimmed.length === 0) return;
    setError(null);
    try {
      const tab = await fetchEndpoint(fetchUgTab, {}, { body: { url: trimmed } });
      const score = compile(tab);
      const endBeat = scoreEndBeat(score);
      const song = await fetchEndpoint(
        createUltimateGuitarSong,
        {},
        { body: { ...tab, durationSec: beatToSeconds(score, endBeat), endBeat } },
      );
      onClose();
      openSongImperative(song);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <Surface
      level="overlay"
      // eslint-disable-next-line layout/no-adhoc-layout -- centered dialog panel width clamp; mirrors the version-history dialog convention
      className="w-full max-w-lg rounded-xl shadow-2xl"
    >
      <Stack gap="md" className="p-lg">
        <Stack gap="2xs">
          <DialogTitle>Import from Ultimate Guitar</DialogTitle>
          <DialogDescription>
            Paste a tab URL to import chords, sections, and lyrics.
          </DialogDescription>
        </Stack>

        <Stack gap="xs">
          <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
            Ultimate Guitar URL
          </span>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void importTab();
              }
            }}
            placeholder="https://tabs.ultimate-guitar.com/tab/..."
            spellCheck={false}
            autoFocus
            className="rounded-md border border-border bg-background px-md py-sm text-body outline-none focus:border-primary"
          />
        </Stack>

        {error ? (
          <span className="text-caption text-destructive" role="alert">
            {error}
          </span>
        ) : null}

        <Stack direction="row" gap="sm" justify="end">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={importTab} disabled={url.trim().length === 0}>
            Import
          </Button>
        </Stack>
      </Stack>
    </Surface>
  );
}

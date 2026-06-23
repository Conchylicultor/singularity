/**
 * Ultimate Guitar loader: paste a UG tab URL, fetch its raw `UgTab`, and hand it
 * up as the persisted `raw`.
 *
 * Unlike the chord-grid loader (which is fully controlled — `raw` *is* what's
 * typed), the source of truth here is the **fetched** `UgTab`: the URL text box
 * is local working state, but the only thing that flows up via `onRaw` is the
 * tab the server returned. Once a tab is loaded we show a small summary and keep
 * the input available to load a different one.
 *
 * Failures are surfaced visibly in a `role="alert"` red line — never swallowed.
 * That includes compile-time chord drops: chord symbols `theory.parseChordSymbol`
 * can't recognise are skipped from the synthesized Score (the bar still
 * advances), so the loader surfaces the dropped set the way the chord-grid
 * loader surfaces its `skipped` list.
 * Persistence (storing the loaded tab against a library song) is a later task,
 * so today this loader is reachable only from the in-player editor section.
 */

import { useMemo, useState } from "react";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { parseUgTab, UgParseError, UgTabSchema, type UgTab } from "../core";
import { fetchUgTab } from "../shared/endpoints";
import { collectUnrecognisedChords } from "./compile";

interface Props {
  raw?: unknown;
  onRaw: (raw: unknown) => void;
}

const PLACEHOLDER = "https://tabs.ultimate-guitar.com/tab/...";

/** Narrow the persisted `raw` to a valid `UgTab`, or `null` if absent/invalid. */
function asUgTab(raw: unknown): UgTab | null {
  const parsed = UgTabSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function UltimateGuitarLoader({ raw, onRaw }: Props) {
  const loaded = asUgTab(raw);
  // The URL box is local working state; pre-fill it with the loaded tab's URL so
  // editing/reloading is easy. The fetched `UgTab` is the persisted `raw`.
  const [url, setUrl] = useState(loaded?.urlWeb ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Compile feedback for the loaded tab: the chord symbols the synthesizer
  // would drop (unrecognised), plus any loud markup-parse failure. Re-derives
  // from the loaded tab the same way the chord-grid loader re-parses its text —
  // shares compile's recognise-gate so the two can't disagree. Malformed markup
  // (the same throw compile would raise) is surfaced, never swallowed.
  const { unrecognised, parseError } = useMemo<{
    unrecognised: string[];
    parseError: string | null;
  }>(() => {
    if (!loaded) return { unrecognised: [], parseError: null };
    try {
      return {
        unrecognised: collectUnrecognisedChords(parseUgTab(loaded)),
        parseError: null,
      };
    } catch (err) {
      if (err instanceof UgParseError)
        return { unrecognised: [], parseError: err.message };
      throw err;
    }
  }, [loaded]);

  // `Button` auto-pends on a promise-returning onClick (spinner + double-click
  // guard), so we return the promise to it rather than void-swallowing it.
  async function load() {
    const trimmed = url.trim();
    if (trimmed.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const tab = await fetchEndpoint(fetchUgTab, {}, { body: { url: trimmed } });
      onRaw(tab);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Stack gap="md">
      {loaded ? (
        <Stack
          gap="2xs"
          className="rounded-md border border-border bg-background px-md py-sm"
        >
          <span className="text-body font-semibold">
            {loaded.songName}
            <span className="font-normal text-muted-foreground">
              {" — "}
              {loaded.artistName}
            </span>
          </span>
          {loaded.key || loaded.capo > 0 ? (
            <span className="text-caption text-muted-foreground">
              {loaded.key ? `Key ${loaded.key}` : null}
              {loaded.key && loaded.capo > 0 ? " · " : null}
              {loaded.capo > 0 ? `Capo ${loaded.capo}` : null}
            </span>
          ) : null}
          {parseError ? (
            <span className="text-caption text-destructive" role="alert">
              {parseError}
            </span>
          ) : unrecognised.length > 0 ? (
            <span className="text-caption text-destructive" role="alert">
              Unrecognised chords (dropped): {unrecognised.join(", ")}
            </span>
          ) : null}
        </Stack>
      ) : null}

      <Stack gap="xs">
        <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
          Ultimate Guitar URL
        </span>
        <Stack direction="row" align="center" gap="sm">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void load();
              }
            }}
            placeholder={PLACEHOLDER}
            spellCheck={false}
            disabled={loading}
            // eslint-disable-next-line layout/no-adhoc-layout -- flex-1: the URL input grows to fill the row while the button stays rigid; Stack has no per-child grow prop
            className="flex-1 rounded-md border border-border bg-background px-md py-sm text-body outline-none focus:border-primary"
          />
          <Button onClick={load} disabled={url.trim().length === 0}>
            Load tab
          </Button>
        </Stack>
      </Stack>

      {error ? (
        <span className="text-caption text-destructive" role="alert">
          {error}
        </span>
      ) : null}
    </Stack>
  );
}

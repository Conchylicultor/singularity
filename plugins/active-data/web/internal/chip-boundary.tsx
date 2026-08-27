import type { ReactNode } from "react";
import { PluginErrorBoundary } from "@plugins/primitives/plugins/error-boundary/web";

/**
 * The error boundary an inline chip loses by never reaching the screen through
 * `slot-render`.
 *
 * Every other slot component is wrapped in `PluginErrorBoundary` by that
 * pipeline's middleware. An inline chip cannot be: it is spliced into a foreign
 * ReactNode tree (a markdown render, a Lexical decorator), so it is rendered
 * straight from the module registry and arrives naked. Nothing announces that —
 * the chip renders fine right up until one throws, and then the crash belongs to
 * whatever happens to be above it.
 *
 * In the editor that is Lexical's own boundary, whose stock fallback is a red
 * box reading "An error was thrown." with no plugin named, no report filed, and
 * the whole content region replaced. This restores what the slot pipeline would
 * have given: contained to the one chip, named by its owning chip, and routed
 * through `boundaryReportSink` so the crash reaches Debug → Reports.
 *
 * Wrap the ELEMENT, never the component type — a wrapper type minted per render
 * would remount the chip (and drop a popover mid-interaction) on every keypress.
 *
 * Only `renderInlineChip` calls this, which is what makes an unboundaried chip
 * unreachable.
 */
export function ChipBoundary({
  chipId,
  token,
  children,
}: {
  /**
   * The chip's own id, from `inlineChip({ id })`.
   *
   * NOT the loader-injected `_pluginId`: `PluginProvider` stamps that onto a
   * COPY of each contribution, and the object in the module registry is the
   * pre-copy original, so it never has one.
   */
  chipId: string;
  /** The matched text, so the fallback says WHICH token failed. */
  token: string;
  children: ReactNode;
}) {
  return (
    <PluginErrorBoundary slot="active-data.inline" label={chipId || token}>
      {children}
    </PluginErrorBoundary>
  );
}

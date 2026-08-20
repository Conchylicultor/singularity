import type { ReactNode } from "react";
import { PluginErrorBoundary } from "@plugins/primitives/plugins/error-boundary/web";
import type { SealedMeta } from "@plugins/framework/plugins/web-sdk/core";

/**
 * The error boundary an inline chip loses by being unsealed.
 *
 * Every other slot component reaches the screen through `slot-render`, whose
 * middleware wraps it in `PluginErrorBoundary`. An inline contribution cannot:
 * it is spliced into a foreign ReactNode tree (a markdown render, a Lexical
 * decorator), so it goes through `UNSAFE_unsealSlotComponent` and arrives
 * naked. Nothing announces that — the chip renders fine right up until one
 * throws, and then the crash belongs to whatever happens to be above it.
 *
 * In the editor that is Lexical's own boundary, whose stock fallback is a red
 * box reading "An error was thrown." with no plugin named, no report filed, and
 * the whole content region replaced. This restores what the slot pipeline would
 * have given: contained to the one chip, named by its owning plugin, and routed
 * through `boundaryReportSink` so the crash reaches Debug → Reports.
 *
 * Wrap the ELEMENT, never the component type — a wrapper type minted per render
 * would remount the chip (and drop a popover mid-interaction) on every keypress.
 */
export function ChipBoundary({
  contribution,
  token,
  children,
}: {
  /** The contribution being rendered; only its loader-injected id is read. */
  contribution: SealedMeta;
  /** The matched text, so the fallback says WHICH token failed. */
  token: string;
  children: ReactNode;
}) {
  return (
    <PluginErrorBoundary
      slot="active-data.inline"
      label={contribution._pluginId ?? token}
    >
      {children}
    </PluginErrorBoundary>
  );
}

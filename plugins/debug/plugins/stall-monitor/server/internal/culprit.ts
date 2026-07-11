import type { StallSection } from "@plugins/debug/plugins/trace/plugins/stall/core";

// Derive the report's dedup grain + labels from the raw stall evidence.
//
// This is the one place that turns "the stacks that were on the frozen loop" into
// a stable fingerprint and a human hint — a presentation concern, so it lives here
// (in the alert plugin) rather than mutating the evidence `StallSection`.
//
// Fingerprint = the STACK, not the leaf. A real flaw caught in review: on the
// Jul-7 stall `topLeaves[0]` is `JSON.parse [native]` — a generic native frame
// shared by every JSON caller — so a leaf-based fingerprint misattributes and
// collapses unrelated JSON-heavy freezes into one row. The top STACK
// (`parseTranscript ← readEntries ← …`) names the actual caller path, is already
// line-free (names only, robust to edits), and distinguishes callers that share a
// native leaf.
//
// `hotFrame` is a human-readable SECONDARY hint (the hottest *attributable* JS
// frame — a leaf carrying a ` @ path:line` source), used in the summary + task
// title, never as the fingerprint.
//
// Both cases guard the empty section: `aggregateTraces` returns empty arrays when
// `total === 0`, so we never index `[0]` blindly — the `?? …` fallbacks cover it.
export function deriveCulprit(section: StallSection): {
  culpritStack: string;
  hotFrame: string;
} {
  const culpritStack = section.topStacks[0]?.stack ?? "unknown";
  const hotFrame =
    section.topLeaves.find((l) => l.key.includes(" @ "))?.key ??
    section.topLeaves[0]?.key ??
    "event-loop stall";
  return { culpritStack, hotFrame };
}

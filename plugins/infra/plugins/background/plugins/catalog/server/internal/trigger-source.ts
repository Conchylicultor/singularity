import { defineServerContribution } from "@plugins/framework/plugins/server-core/core";
import type { BackgroundEntry } from "../../core";

/**
 * Knowledge about WHAT starts an entry that its provider does not own. The jobs
 * provider knows a job accepts events, but which events is the events plugin's
 * knowledge (its declared triggers) — so the events plugin contributes a source
 * and the catalog asks it, naming neither.
 */
export interface BackgroundTriggerSourceSpec {
  /** The provider kind whose entries this source annotates (`job`). */
  kind: string;
  /** The events that start entry `name`, in any order; empty when none are
   * declared statically. */
  eventNames(name: string): readonly string[];
}

export const BackgroundTriggerSource =
  defineServerContribution<BackgroundTriggerSourceSpec>(
    "background.trigger-source",
    { docLabel: (s) => s.kind },
  );

/**
 * Fill an event-triggered entry's `names` from every contributed source for
 * its kind (deduped, sorted). Any other entry passes through unchanged.
 */
export function annotateTrigger(
  entry: BackgroundEntry,
  sources: readonly BackgroundTriggerSourceSpec[],
): BackgroundEntry {
  if (entry.trigger.kind !== "event") return entry;
  const names = new Set(entry.trigger.names);
  for (const s of sources) {
    if (s.kind !== entry.kind) continue;
    for (const n of s.eventNames(entry.name)) names.add(n);
  }
  if (names.size === entry.trigger.names.length) return entry;
  return {
    ...entry,
    trigger: { kind: "event", names: [...names].sort() },
  };
}

import type { ReactNode } from "react";
import { defineDispatchSlot } from "@plugins/primitives/plugins/slot-render/web";
import type { TraceSnapshot } from "../core";
import { GenericEventLane } from "./internal/generic-event-lane";
import { GenericTriggerSummary } from "./internal/generic-trigger-summary";

// A class-agnostic detail descriptor a lane reports up to the pane's shared
// bottom strip when the user clicks one of its elements (a span bar, a gate
// chip…). The engine owns the substrate — title + labelled fields — so the pane
// renders whatever is selected WITHOUT naming a class, exactly as it renders any
// Trace.Lane by dispatch. `null` clears the strip.
export interface TraceSelectionField {
  label: string;
  value: ReactNode;
}
export interface TraceSelection {
  title: ReactNode;
  fields: TraceSelectionField[];
}

// One Gantt lane group per snapshot section, dispatched by classId. A class
// registers its lane keyed by its own id; a section whose class has NO web
// presence still shows up via the GenericEventLane fallback — LOUDLY (raw JSON),
// never silently dropped. The detail pane (Phase 4) renders one Trace.Lane per
// snapshot.events key, so it names no class.
export interface TraceLaneProps {
  classId: string;
  // The class's schema-validated section (its own web side narrows it).
  payload: unknown;
  // Trigger + clock anchors, for window-relative normalization.
  trace: TraceSnapshot;
  // Report a clicked element's detail up to the pane's shared bottom strip
  // (`null` to clear). Optional so the generic fallback lane can ignore it.
  onSelect?: (selection: TraceSelection | null) => void;
}

export interface TraceTriggerSummaryProps {
  trace: TraceSnapshot;
}

export const Trace = {
  Lane: defineDispatchSlot<TraceLaneProps, string>("trace.lane", {
    key: (p) => p.classId,
    fallback: GenericEventLane,
  }),
  // Optional richer summary block in the detail header, dispatched by trigger
  // kind. Falls back to the generic trigger facts.
  TriggerSummary: defineDispatchSlot<TraceTriggerSummaryProps, string>(
    "trace.trigger-summary",
    {
      key: (p) => p.trace.trigger.kind,
      fallback: GenericTriggerSummary,
    },
  ),
};

import type { MembershipState } from "@plugins/plugin-meta/plugins/closure/core";

// The canonical translucent tint per membership state — the SINGLE source of truth
// shared by the Explorer membership band (which paints tree rows) and the Studio
// graph pane (which tints nodes + draws the legend). Living in its own leaf library
// so neither consumer depends on the other (no cross-plugin cycle).
//
// Each tint is low opacity so content reads through it. `excluded` has no band.
export const STATE_TINT: Record<Exclude<MembershipState, "excluded">, string> = {
  entry: "bg-primary/25",
  required: "bg-primary/10",
  contributor: "bg-success/20",
  "via-contributor": "bg-success/10",
  available: "bg-info/10",
};

/** Legend rows for the six membership states, in display order. `excluded` has no band. */
export const STATE_LEGEND: { state: MembershipState; label: string; tint: string | null }[] = [
  { state: "entry", label: "Entry", tint: STATE_TINT.entry },
  { state: "required", label: "Required", tint: STATE_TINT.required },
  { state: "contributor", label: "Contributor", tint: STATE_TINT.contributor },
  { state: "via-contributor", label: "Via contributor", tint: STATE_TINT["via-contributor"] },
  { state: "available", label: "Available", tint: STATE_TINT.available },
  { state: "excluded", label: "Excluded", tint: null },
];

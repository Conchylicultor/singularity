// AUTO-GENERATED from app.css @utility `/* twmerge: … */` markers. Do not edit.
// Run `./singularity build` to regenerate.
// (see plugins/framework/plugins/tooling/plugins/codegen/core/custom-utilities-gen.ts).
//
// The twMerge registry consumed by cn() (lib/utils.ts), derived from app.css —
// the single source of truth for which custom @utility classes exist and how
// tailwind-merge must classify each.
//
// The `app-css-utilities-in-sync` check fails on drift.

import type { RegistryEntry } from "./custom-utilities-types";

export const CUSTOM_UTILITY_REGISTRY = [
  { classes: ["focus-ring", "focus-ring-within", "focus-ring-from"], standalone: true, reason: "Additive box-shadow/outline; no single-value built-in group to conflict with." },
  { classes: ["rounded-checkbox"], extend: "rounded" },
  { classes: ["region-line"], standalone: true, reason: "Composite single-line invariant (align-items + whitespace); name doesn't misfile into a built-in group and it's a base layer, not a selectively-overridden single property." },
  { classes: ["no-scrollbar"], standalone: true, reason: "Hides scrollbar chrome (scrollbar-width + ::-webkit-scrollbar); additive, no single-value built-in group to conflict with." },
  { classes: ["scroll-fade"], standalone: true, reason: "Additive ::before/::after gradient overlays gated on data-fade-*; pseudo-element paint has no single-value built-in group to conflict with." },
  { classes: ["p-chip", "p-control", "p-row", "p-card"], group: "sg-pad", excludes: ["p"], under: [] },
  { classes: ["control-xs", "control-sm", "control-md", "control-lg"], group: "sg-control-height", excludes: ["h"], under: [] },
  { classes: ["control-icon-xs", "control-icon-sm", "control-icon-md", "control-icon-lg"], group: "sg-control-icon", excludes: ["size", "h", "w"], under: [] },
  { classes: ["control-min-xs", "control-min-sm", "control-min-md", "control-min-lg"], group: "sg-control-min", excludes: ["min-h"], under: [] },
  { classes: ["h-chrome-bar", "h-chrome-pane"], extend: "h" },
  { classes: ["px-chrome"], extend: "px" },
  { classes: ["pl-chrome"], extend: "pl" },
  { classes: ["rail-none", "rail-2xs", "rail-xs", "rail-sm", "rail-md", "rail-lg", "rail-xl", "rail-2xl"], group: "sg-rail", excludes: ["p", "px", "py", "pt", "pr", "pb", "pl"], under: [] },
  { classes: ["rail-x-none", "rail-x-2xs", "rail-x-xs", "rail-x-sm", "rail-x-md", "rail-x-lg", "rail-x-xl", "rail-x-2xl", "rail-owe-none", "rail-owe-2xs", "rail-owe-xs", "rail-owe-sm", "rail-owe-md", "rail-owe-lg", "rail-owe-xl", "rail-owe-2xl"], group: "sg-rail-x", excludes: ["px", "pr", "pl"], under: [] },
  { classes: ["rail-y-none", "rail-y-2xs", "rail-y-xs", "rail-y-sm", "rail-y-md", "rail-y-lg", "rail-y-xl", "rail-y-2xl"], group: "sg-rail-y", excludes: ["py", "pt", "pb"], under: [] },
  { classes: ["rail-bleed", "rail-follow"], extend: "px" },
  { classes: ["py-control"], extend: "py" },
  { classes: ["pr-floating-bar"], extend: "pr" },
  { classes: ["cp-panel"], extend: "p" },
  { classes: ["cp-body"], standalone: true, reason: "Composite band container (flex column + gap + the positioned first-rule mask); no single-value built-in group to conflict with." },
  { classes: ["cp-band"], standalone: true, reason: "Composite band marker (positioning context + the full-bleed ::before hairline); no single-value built-in group to conflict with." },
  { classes: ["cp-row"], standalone: true, reason: "Composite row grid (display + tracks + gap + min-height + inline padding + radius); not a single-property utility another class should selectively override." },
  { classes: ["cp-rule"], standalone: true, reason: "Composite builder grid (display + 6 tracks + gap + min-height + inline padding + radius + the data-span collapse); not a single-property utility another class should selectively override." },
  { classes: ["cp-rail-icon"], standalone: true, reason: "A negative hanging offset (margin-inline-start); the built-in margin groups are outside the allowed extend set, and nothing should selectively override half of a rail." },
  { classes: ["gap-none", "gap-2xs", "gap-xs", "gap-sm", "gap-md", "gap-lg", "gap-xl", "gap-2xl"], extend: "gap" },
  { classes: ["gap-x-none", "gap-x-2xs", "gap-x-xs", "gap-x-sm", "gap-x-md", "gap-x-lg", "gap-x-xl", "gap-x-2xl"], extend: "gap-x" },
  { classes: ["gap-y-none", "gap-y-2xs", "gap-y-xs", "gap-y-sm", "gap-y-md", "gap-y-lg", "gap-y-xl", "gap-y-2xl"], extend: "gap-y" },
  { classes: ["p-none", "p-2xs", "p-xs", "p-sm", "p-md", "p-lg", "p-xl", "p-2xl"], extend: "p" },
  { classes: ["px-none", "px-2xs", "px-xs", "px-sm", "px-md", "px-lg", "px-xl", "px-2xl"], extend: "px" },
  { classes: ["py-none", "py-2xs", "py-xs", "py-sm", "py-md", "py-lg", "py-xl", "py-2xl"], extend: "py" },
  { classes: ["pt-none", "pt-2xs", "pt-xs", "pt-sm", "pt-md", "pt-lg", "pt-xl", "pt-2xl"], extend: "pt" },
  { classes: ["pr-none", "pr-2xs", "pr-xs", "pr-sm", "pr-md", "pr-lg", "pr-xl", "pr-2xl"], extend: "pr" },
  { classes: ["pb-none", "pb-2xs", "pb-xs", "pb-sm", "pb-md", "pb-lg", "pb-xl", "pb-2xl"], extend: "pb" },
  { classes: ["pl-none", "pl-2xs", "pl-xs", "pl-sm", "pl-md", "pl-lg", "pl-xl", "pl-2xl"], extend: "pl" },
  { classes: ["text-title", "text-heading", "text-subheading", "text-body", "text-label", "text-caption", "text-title-compact", "text-heading-compact", "text-subheading-compact", "text-body-compact", "text-label-compact", "text-caption-compact"], extend: "font-size" },
  { classes: ["icon-auto"], group: "sg-icon-auto", excludes: ["size", "h", "w"], under: [] },
  { classes: ["z-under", "z-base", "z-raised", "z-nav", "z-float", "z-overlay", "z-popover", "z-draw", "z-max"], extend: "z" },
] as const satisfies readonly RegistryEntry[];

// Synthetic group ids (for extendTailwindMerge's generic type parameter).
export type CustomGroupId = Extract<(typeof CUSTOM_UTILITY_REGISTRY)[number], { group: string }>["group"];

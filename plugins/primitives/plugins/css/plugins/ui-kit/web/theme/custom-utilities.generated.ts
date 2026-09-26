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
  { classes: ["rounded-checkbox", "rounded-squircle", "rounded-card", "rounded-control"], extend: "rounded" },
  { classes: ["region-line"], standalone: true, reason: "Composite single-line invariant (align-items + whitespace); name doesn't misfile into a built-in group and it's a base layer, not a selectively-overridden single property." },
  { classes: ["no-scrollbar"], standalone: true, reason: "Hides scrollbar chrome (scrollbar-width + ::-webkit-scrollbar); additive, no single-value built-in group to conflict with." },
  { classes: ["scroll-fade"], standalone: true, reason: "Additive ::before/::after gradient overlays gated on data-fade-*; pseudo-element paint has no single-value built-in group to conflict with." },
  { classes: ["p-chip", "p-row", "p-card", "p-chip-compact"], group: "sg-pad", excludes: ["p"], under: [] },
  { classes: ["rounded-chip-compact"], extend: "rounded" },
  { classes: ["p-chip-header", "p-thread-card", "p-composer", "p-composer-text", "p-composer-actions", "p-tool-badge", "p-inline-code"], group: "sg-pad", excludes: ["p"], under: [] },
  { classes: ["px-split-arrow"], extend: "px" },
  { classes: ["rounded-tool-badge", "rounded-inline-code"], extend: "rounded" },
  { classes: ["hairline-tool-badge", "hairline-inline-code"], standalone: true, reason: "Role border width for one element that sets no other border width. Not named border-*: tailwind-merge files any border-<word> as a border COLOR, so a colour class beside it would silently drop it." },
  { classes: ["size-op-status-icon", "size-status-dot-xs", "size-status-dot-sm", "size-status-dot-md", "size-status-dot-lg"], extend: "size" },
  { classes: ["h-sidebar-row"], extend: "h" },
  { classes: ["px-sidebar-row"], extend: "px" },
  { classes: ["size-sidebar-icon"], extend: "size" },
  { classes: ["gap-sidebar-icon"], extend: "gap" },
  { classes: ["font-sidebar-label"], extend: "font-weight" },
  { classes: ["control-xs", "control-sm", "control-md", "control-lg"], group: "sg-control-height", excludes: ["h"], under: [] },
  { classes: ["control-icon-xs", "control-icon-sm", "control-icon-md", "control-icon-lg"], group: "sg-control-icon", excludes: ["size", "h", "w"], under: [] },
  { classes: ["control-min-xs", "control-min-sm", "control-min-md", "control-min-lg"], group: "sg-control-min", excludes: ["min-h"], under: [] },
  { classes: ["size-control-icon-xs", "size-control-icon-sm", "size-control-icon-md", "size-control-icon-lg"], extend: "size" },
  { classes: ["px-control-xs", "px-control-sm", "px-control-md", "px-control-lg"], extend: "px" },
  { classes: ["pill-ends"], standalone: true, reason: "Declares which sides are rounded ends; sets custom properties only, no built-in group to conflict with." },
  { classes: ["pill-start"], standalone: true, reason: "Declares the start side a rounded end; sets a custom property only, no built-in group to conflict with." },
  { classes: ["pill-end"], standalone: true, reason: "Declares the end side a rounded end; sets a custom property only, no built-in group to conflict with." },
  { classes: ["gap-control-xs", "gap-control-sm", "gap-control-md", "gap-control-lg", "gap-inherit"], extend: "gap" },
  { classes: ["h-chrome-bar", "h-chrome-pane"], extend: "h" },
  { classes: ["px-chrome"], extend: "px" },
  { classes: ["pl-chrome"], extend: "pl" },
  { classes: ["px-chrome-pane"], extend: "px" },
  { classes: ["pr-floating-bar-pane"], extend: "pr" },
  { classes: ["px-subpane"], extend: "px" },
  { classes: ["rail-none", "rail-2xs", "rail-xs", "rail-sm", "rail-md", "rail-lg", "rail-xl", "rail-2xl"], group: "sg-rail", excludes: ["p", "px", "py", "pt", "pr", "pb", "pl"], under: [] },
  { classes: ["rail-x-none", "rail-x-2xs", "rail-x-xs", "rail-x-sm", "rail-x-md", "rail-x-lg", "rail-x-xl", "rail-x-2xl", "rail-owe-none", "rail-owe-2xs", "rail-owe-xs", "rail-owe-sm", "rail-owe-md", "rail-owe-lg", "rail-owe-xl", "rail-owe-2xl"], group: "sg-rail-x", excludes: ["px", "pr", "pl"], under: [] },
  { classes: ["rail-y-none", "rail-y-2xs", "rail-y-xs", "rail-y-sm", "rail-y-md", "rail-y-lg", "rail-y-xl", "rail-y-2xl"], group: "sg-rail-y", excludes: ["py", "pt", "pb"], under: [] },
  { classes: ["rail-bleed", "rail-follow"], extend: "px" },
  { classes: ["py-row"], extend: "py" },
  { classes: ["pr-floating-bar"], extend: "pr" },
  { classes: ["cp-panel"], extend: "p" },
  { classes: ["cp-body"], standalone: true, reason: "Composite band container (flex column + gap + the positioned first-rule mask); no single-value built-in group to conflict with." },
  { classes: ["cp-band"], standalone: true, reason: "Composite band marker (positioning context + the full-bleed ::before hairline); no single-value built-in group to conflict with." },
  { classes: ["cp-row"], standalone: true, reason: "Composite row grid (display + tracks + gap + min-height + inline padding + radius); not a single-property utility another class should selectively override." },
  { classes: ["cp-rule"], standalone: true, reason: "Composite builder grid (display + 6 tracks + gap + min-height + inline padding + radius + the data-span collapse); not a single-property utility another class should selectively override." },
  { classes: ["cp-setting"], standalone: true, reason: "Composite value-row grid (display + tracks + gap + min-height + the two-sided inline padding + radius); not a single-property utility another class should selectively override." },
  { classes: ["cp-group"], standalone: true, reason: "Composite nested rail region (the deeper published rail + the inline padding that pays it + the region-relative row pad); no single-value built-in group to conflict with." },
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
  { classes: ["text-display", "text-title", "text-heading", "text-subheading", "text-body", "text-label", "text-caption", "text-control"], extend: "font-size" },
  { classes: ["font-control"], extend: "font-weight" },
  { classes: ["text-code", "text-display-compact", "text-title-compact", "text-heading-compact", "text-subheading-compact", "text-body-compact", "text-label-compact", "text-caption-compact", "text-control-compact", "text-chip-compact"], extend: "font-size" },
  { classes: ["font-chip-compact"], extend: "font-weight" },
  { classes: ["text-chip-header"], extend: "font-size" },
  { classes: ["font-chip-header"], extend: "font-weight" },
  { classes: ["text-tool-badge"], extend: "font-size" },
  { classes: ["font-tool-badge"], extend: "font-weight" },
  { classes: ["text-inline-code", "text-count"], extend: "font-size" },
  { classes: ["font-control-strong"], extend: "font-weight" },
  { classes: ["text-code-compact"], extend: "font-size" },
  { classes: ["icon-auto"], group: "sg-icon-auto", excludes: ["size", "h", "w"], under: [] },
  { classes: ["z-under", "z-base", "z-raised", "z-nav", "z-float", "z-overlay", "z-popover", "z-draw", "z-max"], extend: "z" },
] as const satisfies readonly RegistryEntry[];

// Synthetic group ids (for extendTailwindMerge's generic type parameter).
export type CustomGroupId = Extract<(typeof CUSTOM_UTILITY_REGISTRY)[number], { group: string }>["group"];

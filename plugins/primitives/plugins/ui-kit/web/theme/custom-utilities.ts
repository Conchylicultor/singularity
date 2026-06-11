// Canonical registry of every custom `@utility` class declared in app.css, paired
// with how tailwind-merge must treat it. This is the single source of truth: the
// twMerge config in lib/utils.ts is *derived* from CUSTOM_UTILITY_REGISTRY (no
// hand-written conflict map), and the app-css-utilities-in-sync check enforces
// that this registry and app.css never drift in membership.
//
// Why this exists: tailwind-merge classifies a class by its name. A custom utility
// whose suffix is a word (`text-caption`, `z-base`, …) gets misfiled into a
// built-in group — usually text-color for `text-*` — and silently stripped when a
// real class from that group appears later in the string. Registering the literal
// names into the correct group fixes the whole class of bug.
//
// Each *_UTILITIES array below is parsed by name (regex `\w+_UTILITIES = [...]`)
// by the sync check, so the array suffix convention is load-bearing — keep it.

// — Family name lists ————————————————————————————————————————————————————————
export const CONTROL_HEIGHT_UTILITIES = ["control-xs", "control-sm", "control-md", "control-lg"] as const;
export const CONTROL_ICON_UTILITIES = ["control-icon-xs", "control-icon-sm", "control-icon-md", "control-icon-lg"] as const;
export const CONTROL_MIN_UTILITIES = ["control-min-xs", "control-min-sm", "control-min-md", "control-min-lg"] as const;
export const PAD_UTILITIES = ["p-chip", "p-control", "p-row"] as const;
// Spacing-scale families (gap + padding over the 8-step ramp) — backed by the
// density --space-* vars. Each joins its matching built-in tailwind-merge group
// so a named step (`gap-sm`) and a raw Tailwind numeric (`gap-2`) mutually
// conflict during the grandfather period.
export const SPACE_GAP_UTILITIES = ["gap-none", "gap-2xs", "gap-xs", "gap-sm", "gap-md", "gap-lg", "gap-xl", "gap-2xl"] as const;
export const SPACE_GAP_X_UTILITIES = ["gap-x-none", "gap-x-2xs", "gap-x-xs", "gap-x-sm", "gap-x-md", "gap-x-lg", "gap-x-xl", "gap-x-2xl"] as const;
export const SPACE_GAP_Y_UTILITIES = ["gap-y-none", "gap-y-2xs", "gap-y-xs", "gap-y-sm", "gap-y-md", "gap-y-lg", "gap-y-xl", "gap-y-2xl"] as const;
export const SPACE_P_UTILITIES = ["p-none", "p-2xs", "p-xs", "p-sm", "p-md", "p-lg", "p-xl", "p-2xl"] as const;
export const SPACE_PX_UTILITIES = ["px-none", "px-2xs", "px-xs", "px-sm", "px-md", "px-lg", "px-xl", "px-2xl"] as const;
export const SPACE_PY_UTILITIES = ["py-none", "py-2xs", "py-xs", "py-sm", "py-md", "py-lg", "py-xl", "py-2xl"] as const;
export const SPACE_PT_UTILITIES = ["pt-none", "pt-2xs", "pt-xs", "pt-sm", "pt-md", "pt-lg", "pt-xl", "pt-2xl"] as const;
export const SPACE_PR_UTILITIES = ["pr-none", "pr-2xs", "pr-xs", "pr-sm", "pr-md", "pr-lg", "pr-xl", "pr-2xl"] as const;
export const SPACE_PB_UTILITIES = ["pb-none", "pb-2xs", "pb-xs", "pb-sm", "pb-md", "pb-lg", "pb-xl", "pb-2xl"] as const;
export const SPACE_PL_UTILITIES = ["pl-none", "pl-2xs", "pl-xs", "pl-sm", "pl-md", "pl-lg", "pl-xl", "pl-2xl"] as const;
export const TEXT_ROLE_UTILITIES = ["text-title", "text-heading", "text-subheading", "text-body", "text-label", "text-caption"] as const;
export const Z_LAYER_UTILITIES = ["z-base", "z-raised", "z-nav", "z-float", "z-overlay", "z-popover", "z-draw", "z-max"] as const;
export const CHROME_HEIGHT_UTILITIES = ["h-chrome-bar", "h-chrome-pane"] as const;
export const CHROME_PADX_UTILITIES = ["px-chrome"] as const;
export const CHROME_PADL_UTILITIES = ["pl-chrome"] as const;
export const CHROME_PADR_UTILITIES = ["pr-floating-bar"] as const;
export const ICON_AUTO_UTILITIES = ["icon-auto"] as const;
export const FOCUS_RING_UTILITIES = ["focus-ring", "focus-ring-within"] as const;

// — twMerge wiring ————————————————————————————————————————————————————————————
// `extend`     append the literals into an existing built-in tailwind-merge group.
//              Gives order-independent mutual conflict for free AND moves the class
//              out of any wrong fallback group (e.g. text-* out of text-color).
//              Use for single-property utilities whose property maps 1:1 to one
//              built-in group.
// `group`+`conflictsWith`  synthetic group that the listed built-in groups override
//              when they appear later. Use for multi-property utilities (w+h) or
//              when a single property is covered by several built-in groups
//              (height → both `h` and `size`).
// `standalone` intentionally outside twMerge; `reason` is required and documents why.
type BuiltinGroupId =
  | "font-size" | "z" | "h" | "w" | "size" | "min-h"
  | "p" | "px" | "py" | "pt" | "pr" | "pb" | "pl"
  | "gap" | "gap-x" | "gap-y";

type RegistryEntry =
  | { classes: readonly string[]; extend: BuiltinGroupId }
  | { classes: readonly string[]; group: string; conflictsWith: readonly BuiltinGroupId[] }
  | { classes: readonly string[]; standalone: true; reason: string };

export const CUSTOM_UTILITY_REGISTRY = [
  // Single-property → join the matching built-in group (mutual conflict).
  { classes: TEXT_ROLE_UTILITIES, extend: "font-size" },
  { classes: Z_LAYER_UTILITIES, extend: "z" },
  { classes: CHROME_HEIGHT_UTILITIES, extend: "h" },
  { classes: CHROME_PADX_UTILITIES, extend: "px" },
  { classes: CHROME_PADL_UTILITIES, extend: "pl" },
  { classes: CHROME_PADR_UTILITIES, extend: "pr" },
  // Spacing scale → join the matching built-in group (mutual conflict with raw
  // Tailwind gap-N/p-N, and with the affordance pads in sg-pad via its p conflict).
  { classes: SPACE_GAP_UTILITIES, extend: "gap" },
  { classes: SPACE_GAP_X_UTILITIES, extend: "gap-x" },
  { classes: SPACE_GAP_Y_UTILITIES, extend: "gap-y" },
  { classes: SPACE_P_UTILITIES, extend: "p" },
  { classes: SPACE_PX_UTILITIES, extend: "px" },
  { classes: SPACE_PY_UTILITIES, extend: "py" },
  { classes: SPACE_PT_UTILITIES, extend: "pt" },
  { classes: SPACE_PR_UTILITIES, extend: "pr" },
  { classes: SPACE_PB_UTILITIES, extend: "pb" },
  { classes: SPACE_PL_UTILITIES, extend: "pl" },
  // Synthetic groups that the listed built-ins override (control set + icon-auto).
  { classes: CONTROL_HEIGHT_UTILITIES, group: "sg-control-height", conflictsWith: ["size", "h"] },
  { classes: CONTROL_ICON_UTILITIES, group: "sg-control-icon", conflictsWith: ["size", "h", "w"] },
  { classes: CONTROL_MIN_UTILITIES, group: "sg-control-min", conflictsWith: ["min-h"] },
  { classes: PAD_UTILITIES, group: "sg-pad", conflictsWith: ["p"] },
  { classes: ICON_AUTO_UTILITIES, group: "sg-icon-auto", conflictsWith: ["size", "h", "w"] },
  // No twMerge handling: additive box-shadow/outline, no single-value collision.
  { classes: FOCUS_RING_UTILITIES, standalone: true, reason: "Additive box-shadow/outline; no single-value built-in group to conflict with." },
] as const satisfies readonly RegistryEntry[];

// Synthetic group ids (for extendTailwindMerge's generic type parameter).
export type CustomGroupId = Extract<(typeof CUSTOM_UTILITY_REGISTRY)[number], { group: string }>["group"];

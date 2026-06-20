// Types for the custom-utility twMerge registry. This file is hand-authored and
// DATA-FREE: it holds only the shape contracts. The *data* (every custom
// `@utility` class paired with its twMerge classification) is GENERATED from the
// `/* twmerge: … */` markers in app.css into `./custom-utilities.generated.ts`.
// Both that generated file and `../lib/utils.ts` import these types.
//
// Why this exists: tailwind-merge classifies a class by its name. A custom utility
// whose suffix is a word (`text-caption`, `z-base`, …) gets misfiled into a
// built-in group — usually text-color for `text-*` — and silently stripped when a
// real class from that group appears later in the string. Registering the literal
// names into the correct group fixes the whole class of bug.
//
// — twMerge wiring ————————————————————————————————————————————————————————————
// `extend`     append the literals into an existing built-in tailwind-merge group.
//              Gives order-independent mutual conflict for free AND moves the class
//              out of any wrong fallback group (e.g. text-* out of text-color).
//              Use for single-property utilities whose property maps 1:1 to one
//              built-in group. Marker in app.css: `/* twmerge: extend <builtin> */`.
// `group`+`conflictsWith`  synthetic group that the listed built-in groups override
//              when they appear later. Use for multi-property utilities (w+h) or
//              when a single property is covered by several built-in groups
//              (height → both `h` and `size`). Marker: `/* twmerge: <sg-id> */`,
//              with one `/* @twmerge group <sg-id> conflicts: … */` decl per group.
// `standalone` intentionally outside twMerge; `reason` is required and documents
//              why. Marker: `/* twmerge: standalone -- <reason> */`.

// The fixed allow-list of built-in tailwind-merge group ids the project extends.
// The generator owns its own copy of these literals (it can't import this file —
// cross-plugin boundary) and validates every `extend <id>` / `conflicts: <id>`
// marker against it; keep the two in sync.
export type BuiltinGroupId =
  | "font-size" | "z" | "h" | "w" | "size" | "min-h"
  | "p" | "px" | "py" | "pt" | "pr" | "pb" | "pl"
  | "gap" | "gap-x" | "gap-y" | "rounded";

export type RegistryEntry =
  | { classes: readonly string[]; extend: BuiltinGroupId }
  | { classes: readonly string[]; group: string; conflictsWith: readonly BuiltinGroupId[] }
  | { classes: readonly string[]; standalone: true; reason: string };

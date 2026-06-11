import { defineTokenGroup } from "@plugins/ui/plugins/theme-engine/core";

export const densityGroup = defineTokenGroup("density", {
  padChipX: { default: "0.375rem", label: "Chip padding X" },
  padChipY: { default: "0.125rem", label: "Chip padding Y" },
  padControlX: { default: "0.75rem", label: "Control padding X" },
  padControlY: { default: "0.375rem", label: "Control padding Y" },
  padRowX: { default: "0.5rem", label: "Row padding X" },
  padRowY: { default: "0.375rem", label: "Row padding Y" },
  controlHeightXs: { default: "1.5rem", label: "Control height XS" },
  controlHeightSm: { default: "1.75rem", label: "Control height SM" },
  controlHeightMd: { default: "2rem", label: "Control height MD" },
  controlHeightLg: { default: "2.25rem", label: "Control height LG" },
  chromeBarH: { default: "3rem", label: "Chrome bar height" },
  chromePaneH: { default: "2.5rem", label: "Chrome pane header height" },
  chromePadX: { default: "0.75rem", label: "Chrome padding X" },
  // 1-D spacing ramp — the closed set of gap/padding roles consumed by the
  // <Stack gap> / <Inset pad> primitives and the gap-*/p-* @utility classes.
  // Lives here (not a separate group) so layout rhythm scales with the active
  // density preset, exactly like control heights and pads. `none` (0) needs no
  // token. Comfortable seeds 1:1 with today's dominant raw usage (xs=gap-1,
  // sm=gap-2, md=gap-3, lg=gap-4, xl=gap-6, 2xl=gap-8).
  // Quoted kebab keys (like the type-scale group's `font-size-2xs`) so the
  // emitted vars are clean `--space-2xs … --space-2xl` — camelCase can't yield a
  // hyphen before a digit.
  "space-2xs": { default: "0.125rem", label: "Space 2xs" },
  "space-xs": { default: "0.25rem", label: "Space xs" },
  "space-sm": { default: "0.5rem", label: "Space sm" },
  "space-md": { default: "0.75rem", label: "Space md" },
  "space-lg": { default: "1rem", label: "Space lg" },
  "space-xl": { default: "1.5rem", label: "Space xl" },
  "space-2xl": { default: "2rem", label: "Space 2xl" },
});

export type DensityTokenValues = {
  [K in keyof typeof densityGroup.schema]: string;
};

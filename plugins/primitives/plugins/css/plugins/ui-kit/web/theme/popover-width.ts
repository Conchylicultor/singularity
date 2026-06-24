// Single source of truth for the popover width + padding roles. Each is a named
// role mapped to a class via a module-level `Record<Name, string>` indexed by a
// plain prop — mirroring `SURFACE_LEVELS` (theme/surface.ts), no Context.
//
// Co-located in ui-kit (not the `popover` primitive) on purpose: the foundational
// `PopoverContent` consumes these maps directly, and ui-kit is the lowest layer —
// putting the maps here lets it read them without a layer-inverting import cycle,
// while the `popover` primitive (a ui-kit consumer) imports the types
// boundary-legally through the ui-kit barrel.
//
// Width is a CLOSED ramp so a magic Tailwind width can't be sprinkled per call
// site (double-declaration / overflow becomes unrepresentable). `content` is the
// default — size-to-content, matching base-ui's native behavior. Every non-content
// token also carries `max-w-(--available-width)` (base-ui's Positioner exposes the
// CSS var on the popup, same as dropdown-menu.tsx) so no popover overflows a narrow
// viewport. Padding is its own axis, mapped to the `p-*` @utility classes owned by
// app.css, defaulting to `md` (preserves PopoverContent's previously baked-in padding).

export type PopoverWidth = "content" | "xs" | "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl";
export type PopoverPadding = "none" | "2xs" | "xs" | "sm" | "md" | "lg";

export const POPOVER_WIDTH: Record<PopoverWidth, string> = {
  content: "",
  xs: "w-48 max-w-(--available-width)",
  sm: "w-56 max-w-(--available-width)",
  md: "w-64 max-w-(--available-width)",
  lg: "w-72 max-w-(--available-width)",
  xl: "w-80 max-w-(--available-width)",
  "2xl": "w-96 max-w-(--available-width)",
  "3xl": "w-[30rem] max-w-(--available-width)",
  "4xl": "w-[40rem] max-w-(--available-width)",
};

export const POPOVER_PADDING: Record<PopoverPadding, string> = {
  none: "p-none",
  "2xs": "p-2xs",
  xs: "p-xs",
  sm: "p-sm",
  md: "p-md",
  lg: "p-lg",
};

// Max-height is its own axis (co-located with width/padding so `PopoverContent`
// can later adopt the same role; consumed now by `FloatingSurface`). Each token
// bundles a `max-h-*` cap with `overflow-y-auto` so a tall menu scrolls inside the
// surface instead of overflowing the viewport. `none` opts out (size to content).
// `overflow-y-auto` is invisible to `no-adhoc-layout`: the rule scans `className`
// attrs and `cn()` args, and this value is only reached as a dynamic member
// expression `POPOVER_MAX_HEIGHT[maxHeight]` inside `cn()`.

export type PopoverMaxHeight = "none" | "sm" | "md" | "lg" | "xl";
export const POPOVER_MAX_HEIGHT: Record<PopoverMaxHeight, string> = {
  none: "",
  sm: "max-h-48 overflow-y-auto",
  md: "max-h-64 overflow-y-auto",
  lg: "max-h-80 overflow-y-auto",
  xl: "max-h-96 overflow-y-auto",
};

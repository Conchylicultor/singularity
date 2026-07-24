// Single source of truth for semantic surface elevation roles. Each level is a
// frozen bundle of background (plus border / radius / shadow as the role
// warrants), all token-backed — so a color / shadow / shape preset swap
// re-themes every surface of a role *together* instead of each call site drifting.
//
// Co-located in ui-kit (not the `surface` primitive) on purpose: the foundational
// shadcn overlays (Popover / DropdownMenu) consume `SURFACE_LEVELS.overlay`
// directly, and ui-kit is the lowest layer — putting the map here lets them read
// it without a layer-inverting import cycle. Same precedent as control-size's
// runtime living next to the ambient ui-kit so foundational Button can read it.
//
// These are plain Tailwind class strings — NOT one multi-property `@utility` — by
// design: composed via cn(), each property stays a real class, so a consumer's
// `className` override (`bg-muted/30`, `rounded-lg`, `shadow-none`, …) cleanly
// replaces just that property through tailwind-merge instead of nuking the whole
// surface. The `no-adhoc-surface` lint rule
// (plugins/primitives/plugins/surface/lint) bans open-coding these bundles so
// every surface routes through `<Surface>` / `<Card>` / the overlay primitives.

export type SurfaceLevel = "sunken" | "base" | "raised" | "overlay";

// Each role also co-publishes its background as `--chrome-mask` (the arbitrary
// `[--chrome-mask:…]` property), so a sticky bar pinned inside a surface masks
// with that surface's own color instead of the page `--background` — a `base`
// surface resets it back when nested inside a tinted one. This is the surface
// half of the sticky-chrome masking contract (see `Sticky`'s `mask` / `Bar`).
//
// Each role ALSO co-publishes `--hover-fill` — the tone a transient hover paints
// ON it (`bg-hover-fill`, consumed by `Button variant="ghost"`). Same contract,
// opposite direction: `--chrome-mask` is "my background, for something painting
// over me"; `--hover-fill` is "a visible step off my background, for something
// highlighting inside me". A ghost control is transparent, so without this it
// hovers to the page-canvas `--muted` regardless of where it was dropped — which
// on a `sunken` (`bg-muted`) surface or the sidebar is the surface color itself,
// i.e. no hover at all.
export const SURFACE_LEVELS: Record<SurfaceLevel, string> = {
  // Recessed well / band — sits BELOW the base plane. Tone only; contained wells
  // add their own radius and bands add a directional border (e.g. `border-b`).
  // Its background IS `--muted`, so no palette token is a step off it (`--accent`
  // is `--muted`'s twin in every preset) — the hover tone is derived as a small
  // foreground tint, which darkens under light and lightens under dark by
  // construction, at any preset.
  sunken:
    "bg-muted [--chrome-mask:var(--muted)] [--hover-fill:color-mix(in_oklab,var(--foreground)_6%,var(--muted))]",
  // The ground plane: pane / page canvas, toolbar bands, sticky headers. Tone
  // only — flush bands supply their own `border-b` / radius via className.
  base: "bg-background [--chrome-mask:var(--background)] [--hover-fill:var(--muted)]",
  // A card lifted one step above base.
  raised:
    "rounded-md border border-border bg-card shadow-sm [--chrome-mask:var(--card)] [--hover-fill:var(--muted)]",
  // Floats above everything — popovers, menus, command palette, floating panels.
  // Hovers to `--accent`, the tone base-ui's own menu/select items highlight
  // with, so a ghost button in a popover matches the items beside it.
  overlay:
    "rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 [--chrome-mask:var(--popover)] [--hover-fill:var(--accent)]",
};

# Theme

Global base styles and the Tailwind token layer. Token **values** (`--background`,
`--primary`, etc.) are **not** declared here — they are owned solely by the
token-group descriptors (`defineTokenGroup`) and emitted at runtime by
`ThemeInjector` (one `<style id="theme-engine-<group>">` per group). `app.css`
holds only non-token base styles: the `@theme` Tailwind tokens, the `@theme
inline` bridges (which map `--color-*`/`--text-*`/`--radius-*`/`--shadow-*`
utility tokens onto the runtime vars), the structural `--z-*` ladder,
`color-scheme` on `:root`/`.dark`, the `@utility` definitions, and `@layer base`.

There's no SSR, so the first painted frame is themed by two pre-paint mechanisms
instead of by `ThemeInjector` (which only runs after React mounts + a config
round-trip):

- **Warm path (≈every load):** `ThemeInjector` writes the full resolved CSS for
  every group to `localStorage` (`theme-engine`'s `theme-cache.ts`); a generic
  inline replay script in `index.html` re-injects it as `<style id="theme-engine-*">`
  before first paint. `ThemeInjector` then adopts those same elements by id, so
  there is no flash and no duplicate styles. The envelope is keyed by app path
  (a forked app's reload replays its own theme; the script longest-prefix matches
  the pathname and falls back to the `""` global entry) and stores the *configured*
  color mode, so the script re-resolves a `"system"` setting against the live OS
  scheme each load.
- **Cold path (first-ever visit, incognito, cleared storage):** no cache, so the
  inline script only sets `color-scheme` from the OS preference and the page shows
  the neutral `html { background: Canvas }` loading floor below (the app is blank
  until boot completes anyway); `ThemeInjector` fills real values on mount.

No static token values are reintroduced — the token group remains the single
owner of every `--token`.

## Rules

- **No plugin-specific CSS here.** Animations, keyframes, component overrides, and structural styles belong in the plugin that uses them (as a `.css` file imported from the plugin's own code).
- **Plugins consume tokens, never define them.** Plugin CSS files may reference `var(--background)` etc. but must not set `--background:` or any other theme variable. This rule is now **machine-enforced** by the `css-vars-single-owner` check: every token-group var must have exactly one declaring owner (its token group), so re-declaring one in static CSS — here or in any plugin — fails the build (declarations inside `@theme`/`@theme inline` are excluded, being Tailwind's lower-precedence utility layer).
- **No plugin-level theming.** Themes are controlled globally. Plugins must not define their own theme overrides, color schemes, or mode-specific (`.dark`) custom property blocks. If a plugin needs a new token, add it to the relevant token group's descriptor.

## Surface-relative helper vars (`--chrome-mask`, `--hover-fill`)

Two vars are **derived helpers**, not token-group tokens: they hold no value of
their own, they *follow the surface* a component was dropped into. Every surface
co-publishes both — see the `:root, [data-theme-scope]` defaults here,
`SURFACE_LEVELS` (per elevation role), and the app-shell sidebar wrapper.

| var | utility | means |
|---|---|---|
| `--chrome-mask` | `bg-chrome-mask` | *my background*, for a sticky bar painting **over** me |
| `--hover-fill` | `bg-hover-fill` | *a visible step off my background*, for a control highlighting **inside** me |

`--hover-fill` exists because a **transparent** control has no surface of its own:
`Button variant="ghost"` used to hover to the fixed `bg-muted`, which is
calibrated against the page canvas (`--background`). Dropped in a sidebar, where
`--sidebar` (0.965) and `--muted` (0.97) are the same tone, the hover painted the
surface color onto itself and read as *no hover at all* — while the
`SidebarMenuButton` beside it (correctly hovering to `--sidebar-accent`) lit up,
so one row highlighted in two different ways. Following `--hover-fill` makes the
two identical **by construction** rather than by matching hardcoded classes.

Consequences when adding either:

- **Publish both together.** A new tinted surface that sets a background and
  neither var inherits the *enclosing* surface's — the hover/mask silently
  belongs to the wrong plane.
- **Re-declare at the scope root.** Both are custom properties, and
  custom-property inheritance passes the **computed** value: anchored on `:root`
  alone, a forked app's `[data-theme-scope]` subtree inherits the desktop
  preset's resolved color and ignores its own. Hence `:root, [data-theme-scope]`.
  The `inherited-theme-defaults-scoped` check enforces this.
- **Only transparent variants follow the surface.** `default`/`outline`/
  `secondary`/`destructive` paint their own background, so their hover is
  relative to *themselves* and correctly stays a fixed token.

## Adding a custom `@utility` (the twMerge marker)

`app.css` is the **single source of truth** for every custom `@utility` AND for how
`cn()`/tailwind-merge must classify it. The registry consumed by `cn()`
(`custom-utilities.generated.ts`) is **generated** from co-located markers by
`./singularity build` — there is no array to edit anywhere, and membership can't
drift.

Every `@utility` MUST carry one co-located `/* twmerge: <ref> */` marker (the
generator throws, with the offending `@utility` named, if any is missing — an
immediate codegen-step build error, not a silent post-build check miss). `<ref>`:

- `extend <builtin>` — append the class into an existing built-in tailwind-merge
  group (single-property utilities whose property maps 1:1 to one group). Gives
  order-independent mutual conflict and lifts the class out of any wrong fallback
  group (e.g. a `text-*` role out of text-color). Allowed `<builtin>` ids:
  `font-size z h w size min-h p px py pt pr pb pl gap gap-x gap-y rounded`.
- `<sg-id>` — a synthetic group id, for multi-property utilities (e.g. `h`+`w`) or a
  property covered by several built-in groups (`height` → both `h` and `size`).
  Declare the group **once** in the section-header comment as
  `/* @twmerge group <sg-id> conflicts: <builtin…> */`; each member just references
  the id. The listed built-ins override the group when they appear later.
- `standalone -- <reason>` — intentionally outside twMerge; the reason is required.

Examples (all real, from `app.css`):

```css
/* Density padding utilities … @twmerge group sg-pad conflicts: p */
@utility p-card    { padding: var(--pad-card); }                /* twmerge: sg-pad */
@utility p-sm      { padding: var(--space-sm); }                /* twmerge: extend p */
@utility focus-ring { … /* twmerge: standalone -- Additive box-shadow/outline; no single-value built-in group to conflict with. */ }
```

The marker may sit at end-of-line, on the line below, or inside the rule body — the
generator slices from each `@utility` to the next and reads the first
`/* twmerge: … */` in that slice. After editing, run `./singularity build`; the
`app-css-utilities-in-sync` check guards the regenerated file.

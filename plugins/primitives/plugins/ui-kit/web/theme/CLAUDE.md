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

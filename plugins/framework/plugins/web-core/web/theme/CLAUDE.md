# Theme

Global base styles and the Tailwind token layer. Token **values** (`--background`,
`--primary`, etc.) are **not** declared here — they are owned solely by the
token-group descriptors (`defineTokenGroup`) and emitted at runtime by
`ThemeInjector` (one `<style id="theme-engine-<group>">` per group). `app.css`
holds only non-token base styles: the `@theme` Tailwind tokens, the `@theme
inline` bridges (which map `--color-*`/`--text-*`/`--radius-*`/`--shadow-*`
utility tokens onto the runtime vars), the structural `--z-*` ladder,
`color-scheme` on `:root`/`.dark`, the `@utility` definitions, and `@layer base`.

Because there's no SSR, a brief unstyled flash before `ThemeInjector` mounts is
accepted — the injector then supplies every group's resolved light+dark values.

## Rules

- **No plugin-specific CSS here.** Animations, keyframes, component overrides, and structural styles belong in the plugin that uses them (as a `.css` file imported from the plugin's own code).
- **Plugins consume tokens, never define them.** Plugin CSS files may reference `var(--background)` etc. but must not set `--background:` or any other theme variable. This rule is now **machine-enforced** by the `css-vars-single-owner` check: every token-group var must have exactly one declaring owner (its token group), so re-declaring one in static CSS — here or in any plugin — fails the build (declarations inside `@theme`/`@theme inline` are excluded, being Tailwind's lower-precedence utility layer).
- **No plugin-level theming.** Themes are controlled globally. Plugins must not define their own theme overrides, color schemes, or mode-specific (`.dark`) custom property blocks. If a plugin needs a new token, add it to the relevant token group's descriptor.

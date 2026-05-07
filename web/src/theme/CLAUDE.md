# Theme

Global theme tokens and base styles. This is the **only** place where CSS custom properties (`--background`, `--primary`, etc.) may be defined.

## Rules

- **No plugin-specific CSS here.** Animations, keyframes, component overrides, and structural styles belong in the plugin that uses them (as a `.css` file imported from the plugin's own code).
- **Plugins consume tokens, never define them.** Plugin CSS files may reference `var(--background)` etc. but must not set `--background:` or any other theme variable.
- **No plugin-level theming.** Themes are controlled globally from this folder. Plugins must not define their own theme overrides, color schemes, or mode-specific (`.dark`) custom property blocks. If a plugin needs a new token, add it here.

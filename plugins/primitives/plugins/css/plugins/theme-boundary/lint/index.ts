import noAdhocThemeScope from "./no-adhoc-theme-scope";

/**
 * Lint barrel for the `no-adhoc-theme-scope` rule. The root `eslint.config.ts`
 * auto-discovers this default export and registers
 * `theme-boundary/no-adhoc-theme-scope` repo-wide as `error`.
 *
 * A plain `rules` entry, NOT `classRules`: the rule reads a JSX ATTRIBUTE and an
 * import specifier, not Tailwind class tokens, so it needs none of the shared
 * class-token walk `classRules` factories are handed.
 *
 * The `ignores` glob is the single PERMANENT tier and lists exactly one thing —
 * this plugin's own tree. `<Theme>` writes the raw `data-theme-scope` and
 * renders the `PortalThemeScopeProvider` because it IS the implementation both
 * messages redirect to (mirrors how `no-adhoc-surface` exempts the shadcn
 * primitives that own the raw surface recipe). Never add a second glob: a
 * genuinely-bespoke boundary escapes per-site, with its reason travelling next
 * to the code —
 *
 *   // eslint-disable-next-line theme-boundary/no-adhoc-theme-scope -- <reason>
 */
export default {
  name: "theme-boundary",
  rules: {
    "no-adhoc-theme-scope": noAdhocThemeScope,
  },
  ignores: {
    "no-adhoc-theme-scope": [
      // ── PERMANENT: the <Theme> primitive itself ──
      // It stamps the attribute and renders the provider; that is the whole
      // implementation of the contract this rule points at.
      "plugins/primitives/plugins/css/plugins/theme-boundary/**/*.{ts,tsx}",
    ],
  },
};

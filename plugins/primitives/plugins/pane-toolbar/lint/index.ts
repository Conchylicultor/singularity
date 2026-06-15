import noAdhocPaneToolbar from "./no-adhoc-pane-toolbar";

/**
 * Lint barrel for the `no-adhoc-pane-toolbar` rule. The root `eslint.config.ts`
 * auto-discovers this default export and registers the rule repo-wide as `error`.
 *
 * A pane toolbar must route through a render-slot host — `definePaneToolbar`
 * (this plugin) for a full-surface pane, or `AppShellLayout`'s `toolbarSlot` for
 * an app-level bar — never a hand-rolled `border-b` + `pr-floating-bar` header.
 *
 * `ignores` exempts the sanctioned home of the chrome-bar signature. Both toolbar
 * hosts (`AppShellLayout`, this plugin's `Host`) now compose the `Bar` primitive
 * rather than wearing the raw `border-b` + `pr-floating-bar` classes, so the only
 * file carrying that signature is `Bar` itself:
 *  - `bar/web/internal/bar.tsx` — the chrome-strip primitive.
 *
 * A genuinely-irreducible one-off escapes per-site, travelling with the code:
 *   // eslint-disable-next-line pane-toolbar/no-adhoc-pane-toolbar -- <reason>
 */
export default {
  name: "pane-toolbar",
  rules: {
    "no-adhoc-pane-toolbar": noAdhocPaneToolbar,
  },
  ignores: {
    "no-adhoc-pane-toolbar": [
      "plugins/primitives/plugins/bar/web/internal/bar.tsx",
    ],
  },
};

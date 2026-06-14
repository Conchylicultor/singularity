import noAdhocPaneToolbar from "./no-adhoc-pane-toolbar";

/**
 * Lint barrel for the `no-adhoc-pane-toolbar` rule. The root `eslint.config.ts`
 * auto-discovers this default export and registers the rule repo-wide as `error`.
 *
 * A pane toolbar must route through a render-slot host — `definePaneToolbar`
 * (this plugin) for a full-surface pane, or `AppShellLayout`'s `toolbarSlot` for
 * an app-level bar — never a hand-rolled `border-b` + `pr-floating-bar` header.
 *
 * `ignores` exempts the sanctioned hosts (which legitimately wear that
 * signature) by path:
 *  - `app-shell-layout.tsx` — the app-level toolbar host.
 *  - `define-pane-toolbar.tsx` — this plugin's own `Host`.
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
      "plugins/primitives/plugins/app-shell/web/components/app-shell-layout.tsx",
      "plugins/primitives/plugins/pane-toolbar/web/internal/define-pane-toolbar.tsx",
    ],
  },
};

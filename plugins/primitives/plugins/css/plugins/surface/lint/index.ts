import noAdhocSurface from "./no-adhoc-surface";

/**
 * Lint barrel for the `no-adhoc-surface` rule. The root `eslint.config.ts`
 * auto-discovers this default export and registers `no-adhoc-surface` repo-wide
 * as `error`. This rule subsumes the former `card/no-adhoc-card` — its raised
 * fingerprint IS the old card fingerprint, plus a new overlay fingerprint.
 *
 * The `ignores` glob below is the single PERMANENT tier — the shadcn surface
 * *primitive definitions* under `ui-kit/web/components/ui/`. They open-code the
 * recipe as literal strings on base-ui `*.Popup` member tags because they ARE the
 * implementation behind `<Surface level="overlay">` / `PopoverContent` /
 * `DropdownMenuContent`; they own the raw recipe and will never migrate (mirrors
 * how `no-adhoc-layout` exempts the layout primitives that own raw mechanics).
 *
 * Everything else escapes WITHOUT an allowlist: the canonical sanctioned surface
 * routes through the `SURFACE_LEVELS` member-access indirection (opaque to the
 * rule's literal-only token walk), and a one-off bespoke site escapes per-site —
 * use the named `p-card` padding token (raised escape) or
 * `// eslint-disable-next-line surface/no-adhoc-surface -- <reason>`.
 */
export default {
  name: "surface",
  rules: {
    "no-adhoc-surface": noAdhocSurface,
  },
  ignores: {
    "no-adhoc-surface": [
      // ── PERMANENT: the shadcn surface-primitive definitions themselves ──
      // They open-code the raised/overlay recipe as literal strings (the
      // implementation behind <Surface>/PopoverContent/DropdownMenuContent).
      "plugins/primitives/plugins/css/plugins/ui-kit/web/components/ui/**/*.{ts,tsx}",
    ],
  },
};

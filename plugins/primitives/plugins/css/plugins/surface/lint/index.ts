import noAdhocSurface from "./no-adhoc-surface";

/**
 * Lint barrel for the `no-adhoc-surface` rule. The root `eslint.config.ts`
 * auto-discovers this default export and registers `no-adhoc-surface` repo-wide
 * as `error`. This rule subsumes the former `card/no-adhoc-card` — its raised
 * fingerprint IS the old card fingerprint, plus a new overlay fingerprint.
 *
 * `ignores` is intentionally EMPTY (no central allowlist — mirrors card/row).
 * Bespoke surfaces escape via per-site markers that travel WITH the code: render
 * through `<Surface>`/`<Card>`/`PopoverContent` (capitalized host tag — skipped),
 * use the named `p-card` padding token (raised escape), or
 * `// eslint-disable-next-line surface/no-adhoc-surface -- <reason>`.
 */
export default {
  name: "surface",
  rules: {
    "no-adhoc-surface": noAdhocSurface,
  },
  ignores: {
    "no-adhoc-surface": [],
  },
};

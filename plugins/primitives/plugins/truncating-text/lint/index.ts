import noClipWithoutNowrap from "./no-clip-without-nowrap";

/**
 * Lint barrel for the `no-clip-without-nowrap` rule. The root `eslint.config.ts`
 * auto-discovers this default export and registers the rule repo-wide as `error`.
 *
 * The rule closes the "overflow-hidden trap": a horizontal flex chrome row that
 * clips overflow but never sets `whitespace-nowrap` looks defended yet silently
 * wraps to a second line. There is no `ignores` allowlist — a genuine multi-line
 * or non-text clip escapes per-site, travelling with the code:
 *
 *   // eslint-disable-next-line truncating-text/no-clip-without-nowrap -- <reason>
 */
export default {
  name: "truncating-text",
  rules: {
    "no-clip-without-nowrap": noClipWithoutNowrap,
  },
};

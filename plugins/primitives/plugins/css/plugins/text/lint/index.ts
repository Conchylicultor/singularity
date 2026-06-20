import noAdhocTypography from "./no-adhoc-typography";
import noClipWithoutNowrap from "./no-clip-without-nowrap";

/**
 * Lint barrel for the `text` plugin's rules. The root `eslint.config.ts`
 * auto-discovers this default export and registers each rule repo-wide as `error`.
 *
 * - `no-adhoc-typography` — text hierarchy routes through the `<Text variant>`
 *   primitive (or the matching `text-{caption,body,label,…}` token utility), never
 *   a raw named size (`text-{xs,sm,base,lg,xl,…}`) or a raw `leading-*`. The
 *   sanctioned sub-scale `text-2xs`/`text-3xs` and color utilities are not flagged.
 * - `no-clip-without-nowrap` — closes the "overflow-hidden trap": a horizontal flex
 *   chrome row that clips overflow but never sets `whitespace-nowrap` looks defended
 *   yet silently wraps to a second line. It lives here (relocated from the deleted
 *   `truncating-text` plugin) because `text` now owns the single-line leaf — a
 *   `<Text>` inside a line container — that the fix routes truncation to.
 *
 * Neither has an `ignores` allowlist — a genuinely-fixed one-off escapes per-site,
 * travelling with the code:
 *
 *   // eslint-disable-next-line text/no-adhoc-typography -- <reason>
 *   // eslint-disable-next-line text/no-clip-without-nowrap -- <reason>
 */
export default {
  name: "text",
  rules: {
    "no-adhoc-typography": noAdhocTypography,
    "no-clip-without-nowrap": noClipWithoutNowrap,
  },
};

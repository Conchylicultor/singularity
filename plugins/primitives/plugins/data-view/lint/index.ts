import noAdhocRowList from "./no-adhoc-row-list";
import type { LintContribution } from "@plugins/framework/plugins/tooling/plugins/lint/core";

/**
 * Lint barrel for the `no-adhoc-row-list` rule. The root `eslint.config.ts`
 * auto-discovers this default export and registers `data-view/no-adhoc-row-list`
 * repo-wide as `error`.
 *
 * `exempt/index.ts` carries the PERMANENT sanctioned homes — the primitives that ARE the
 * row-rendering machinery, so a `.map` → `<Row>` inside them is the
 * implementation, not a hand-rolled data list. This is not a grandfather list:
 * genuine transient-chrome uses everywhere else escape per-site via
 * `// eslint-disable-next-line data-view/no-adhoc-row-list -- <reason>`, a marker
 * that travels WITH the code.
 */
export default {
  name: "data-view",
  rules: {
    "no-adhoc-row-list": noAdhocRowList,
  },
} satisfies LintContribution;

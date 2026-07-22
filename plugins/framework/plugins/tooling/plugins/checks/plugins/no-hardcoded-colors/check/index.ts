import { grepCode } from "@plugins/framework/plugins/tooling/plugins/checks/core";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; inputKeyed?: boolean; run(): Promise<CheckResult> };

// Tailwind color-scale names that have a semantic/categorical token replacement.
const SCALE_NAMES =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";

const COLOR_PATTERNS = [
  // 1. Raw Tailwind color-scale utility classes (bg-…-600, dark:text-…-950, …).
  `(dark:)?(bg|text|border|ring|outline|fill|stroke|from|via|to|shadow|caret|accent|divide|placeholder|decoration)-(${SCALE_NAMES})-[0-9]{2,3}`,
  // 2. The same scale smuggled through a CSS var (var(--color-…-500)).
  `var\\(--color-(${SCALE_NAMES})-[0-9]{2,3}`,
  // 3. Arbitrary literal color values in a utility (bg-[ … ] with #hex / oklch / rgb / hsl).
  `(bg|text|border|ring|outline|fill|stroke|from|via|to|shadow|caret|accent|divide|decoration)-\\[(#|oklch|rgb|hsl)`,
];

// One alternation covering all three forms — used both as the git grep narrowing
// arg and as the JS source-of-truth pattern run on masked source.
const COLOR_ALTERNATION = COLOR_PATTERNS.map((p) => `(${p})`).join("|");

const check: Check = {
  id: "no-hardcoded-colors",
  // INPUT-KEYED (Stage 1). Pure `grepCode` (with a `:(glob)plugins/**` pathspec,
  // which read-set.ts's superset-safe pathspecToRegex handles). See
  // no-raw-websocket for rationale.
  inputKeyed: true,
  description:
    "Hardcoded colors are banned: use semantic tokens (success/warning/info/destructive) or the categorical palette",
  async run() {
    const root = await getWorktreeRoot();
    const matches = await grepCode({
      root,
      pattern: new RegExp(COLOR_ALTERNATION),
      grepArg: COLOR_ALTERNATION,
      maskStrings: false,
      pathspecs: [":(glob)plugins/**/*.ts", ":(glob)plugins/**/*.tsx"],
    });

    if (matches.length === 0) return { ok: true };

    const offenders = matches.map((m) => `${m.path}:${m.line}:${m.text}`);

    return {
      ok: false,
      message: `hardcoded colors found in ${offenders.length} place(s):\n    ${offenders.join("\n    ")}`,
      hint: `No raw Tailwind color scales, arbitrary color literals, or named-color CSS vars. Use tokens:
  • Success / done / added / positive  → bg-success, text-success, bg-success/10
  • Warning / pending / held / caution → bg-warning, text-warning, bg-warning/10
  • Info / in-progress / running       → bg-info, text-info, bg-info/10
  • Error / failed / deleted           → bg-destructive, text-destructive
  • Neutral / muted                    → bg-muted, text-muted-foreground
  • Brand action                       → bg-primary, text-primary-foreground
For categorical data-viz (Gantt phase, model tier, runtime/method badge, hash-assigned chips),
use the themeable categorical palette: bg-categorical-1 … bg-categorical-10 / text-categorical-N
(defined by the ui-tokens-categorical group; values live in the theme, not in component code).`,
    };
  },
};

export default check;

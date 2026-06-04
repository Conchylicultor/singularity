import { ESLintUtils, type TSESTree } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/anthropics/singularity/lint/${name}`,
);

/**
 * Arbitrary sub-12px font sizes (the `text-[<N>px]` / `text-[<N>rem]`
 * arbitrary-value classes) bypass the named typography scale and are the root
 * cause of the type-size sprawl the token system exists to close. This rule bans
 * them and redirects to the named steps. The mapped px and rem values auto-fix;
 * everything else reports only.
 *
 * Classes appear in two shapes:
 *   - bare JSX `className="… <class> …"` → string `Literal`
 *   - inside `cn("… <class> …", …)` and template literals → `Literal` +
 *     `TemplateElement`
 * Rather than special-case each call site we visit every string `Literal` and
 * every `TemplateElement` and test its text against an anchored regex. That is
 * robust to however the class string is assembled.
 */

// Two unit branches captured separately so the existing px fixer path is
// untouched: group 1 is the full token, group 2 the px digits (when px), group 3
// the rem number (when rem). Exactly one of group 2 / group 3 is set per match.
const BANNED = /(?:^|\s)(text-\[(?:(\d+)px|([\d.]+)rem)\])/g;

/**
 * Pixel size → named replacement for the three auto-fixable steps. Keyed by the
 * numeric px value (not the literal `text-[Npx]` string) so this rule file does
 * not itself contain a banned class token — otherwise the rule would flag its
 * own source.
 */
const FIX_PX: Record<string, string> = {
  "10": "text-3xs",
  "11": "text-2xs",
  "12": "text-xs",
};

/**
 * Rem size → named replacement for the on-scale rem steps. Keyed by the numeric
 * rem value (same self-reference avoidance as FIX_PX). Off-scale rem values
 * (e.g. 0.8rem, 0.65rem) are absent here and therefore report-only (fix: null),
 * matching the px off-scale behavior.
 */
const FIX_REM: Record<string, string> = {
  "0.625": "text-3xs",
  "0.6875": "text-2xs",
  "0.75": "text-xs",
};

export default createRule({
  name: "no-arbitrary-font-size",
  meta: {
    type: "problem",
    fixable: "code",
    docs: {
      description:
        "Disallow arbitrary text-[Npx] font sizes — use the named typography scale.",
    },
    schema: [],
    messages: {
      arbitraryFontSize:
        "text-[Npx] / text-[Nrem] arbitrary font sizes are banned — use " +
        "text-3xs (10px), text-2xs (11px), or text-xs (12px). Add a token in " +
        "plugins/ui/plugins/tokens/plugins/typography/shared/group.ts for a new step.",
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.sourceCode;

    /**
     * Report (and optionally fix) every banned class inside a node whose raw
     * source text occupies [rawStart, rawEnd). `text` is the string *value* the
     * class lives in; `rawStart` is the absolute offset where that value's raw
     * text begins in the source (i.e. just after the opening quote / backtick),
     * so a match at index `i` in `text` maps to `rawStart + i` in the file. We
     * fix by replacing only the matched token's exact range — never the whole
     * literal — so quotes, surrounding classes, and other matches are
     * untouched. Multiple matches in one literal each get their own report/fix.
     */
    function check(node: TSESTree.Node, text: string, rawStart: number) {
      for (const m of text.matchAll(BANNED)) {
        const token = m[1]!; // the matched arbitrary-value class
        const px = m[2]; // the px digits (e.g. 10) when the px branch matched
        const rem = m[3]; // the rem number (e.g. 0.8) when the rem branch matched
        // m.index points at the (?:^|\s) anchor; the token starts after any
        // leading whitespace the anchor consumed.
        const tokenStart = m.index + m[0].length - token.length;
        const absStart = rawStart + tokenStart;
        const absEnd = absStart + token.length;

        // Exactly one of px / rem is set per match. On-scale values in either map
        // auto-fix; off-scale values report only (replacement === undefined).
        const replacement =
          px !== undefined ? FIX_PX[px] : rem !== undefined ? FIX_REM[rem] : undefined;
        context.report({
          node,
          messageId: "arbitraryFontSize",
          loc: {
            start: sourceCode.getLocFromIndex(absStart),
            end: sourceCode.getLocFromIndex(absEnd),
          },
          fix: replacement
            ? (fixer) => fixer.replaceTextRange([absStart, absEnd], replacement)
            : null,
        });
      }
    }

    return {
      Literal(node) {
        if (typeof node.value !== "string") return;
        // A string literal's raw text is `"…"` / `'…'`; the value starts one
        // char in (after the opening quote). Escapes would desync value vs raw
        // offsets, but Tailwind class strings contain none, and a misaligned
        // fix would simply not apply cleanly — never corrupt unrelated source.
        check(node, node.value, node.range[0] + 1);
      },
      TemplateElement(node) {
        // Template chunks expose `.raw` with its exact source; the raw text of a
        // TemplateElement starts one char after the element's range start
        // (after the opening `` ` `` or `}`).
        check(node, node.value.raw, node.range[0] + 1);
      },
    };
  },
});

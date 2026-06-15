/**
 * Tests for the `no-adhoc-card-title-font` lint rule. Run with `bun test`:
 *
 *   bun test plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/collapsible-card/lint/no-adhoc-card-title-font.test.ts
 *
 * Proves the title-font boundary actually fires on a raw `<span className="font-mono">`
 * inside a `CollapsibleCard` `label=`/`note=` node, and stays quiet for the
 * sanctioned cases: a plain-string label, a font class on a typography-owning
 * COMPONENT (`<Badge>`), a non-font class, and a non-`CollapsibleCard` owner.
 */

import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import rule from "./no-adhoc-card-title-font";

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    parserOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      ecmaFeatures: { jsx: true },
    },
  },
});

// `RuleTester.run` drives the harness itself (calls ambient describe/it), so it
// must run at module top level — never wrapped in a `test()` callback.
ruleTester.run(
  "no-adhoc-card-title-font",
  rule as unknown as Parameters<RuleTester["run"]>[1],
  {
    valid: [
      // Plain string title — the canonical migrated shape.
      { code: `const x = <CollapsibleCard label="Thinking" />;` },
      // Color accent (not a font family) inside the title — allowed.
      {
        code: `const x = <CollapsibleCard label={<span className="text-primary">Instructions</span>} />;`,
      },
      // font-mono on a COMPONENT (Badge) — a typography-owning primitive; exempt.
      {
        code: `const x = <CollapsibleCard label={<Badge className="shrink-0 font-mono">{name}</Badge>} />;`,
      },
      // font-mono in a child of a DIFFERENT component's title — not CollapsibleCard.
      {
        code: `const x = <OtherCard label={<span className="font-mono">x</span>} />;`,
      },
      // font-mono in the BODY (children), not the title node — out of scope.
      {
        code: `const x = <CollapsibleCard label="Memory"><span className="font-mono">{body}</span></CollapsibleCard>;`,
      },
    ],
    invalid: [
      // The exact pre-migration drift: a raw mono span as the title.
      {
        code: `const x = <CollapsibleCard label={<span className="font-mono">Skills Available</span>} />;`,
        errors: [{ messageId: "adhocCardTitleFont" }],
      },
      // Same, but on the `note` slot, and font-sans.
      {
        code: `const x = <CollapsibleCard label="Hook" note={<span className="font-sans">x</span>} />;`,
        errors: [{ messageId: "adhocCardTitleFont" }],
      },
    ],
  },
);

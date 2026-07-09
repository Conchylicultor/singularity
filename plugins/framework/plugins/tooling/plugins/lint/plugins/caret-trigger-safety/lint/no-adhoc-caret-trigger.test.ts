/**
 * Tests for the `no-adhoc-caret-trigger` lint rule. Run with `bun test`.
 *
 * The rule flags the hand-rolled caret-menu shape: scanning editor text for a
 * trigger (`lastIndexOf` / `indexOf`) from inside a Lexical
 * `registerUpdateListener`. Either half alone is legitimate — a bare update
 * listener is how the markdown shortcuts and the doc→row projection subscribe,
 * and a bare `indexOf` is just string work — so only the conjunction fires.
 */

import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import rule from "./no-adhoc-caret-trigger";

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    parserOptions: { ecmaVersion: "latest", sourceType: "module" },
  },
});

ruleTester.run("no-adhoc-caret-trigger", rule as unknown as Parameters<RuleTester["run"]>[1], {
  valid: [
    // An update listener with no text scan — the format toolbar / markdown shortcuts.
    `editor.registerUpdateListener(() => { const sel = $getSelection(); });`,
    // A text scan with no update listener — insertLink locating the trigger to replace.
    `const idx = full.slice(0, caretOffset).lastIndexOf("[[");`,
    // The sanctioned consumer shape: no listener, no scan.
    `const caret = useCaretQuery({ id: "slash", trigger: "/" });`,
    // `indexOf` on an array in a component that happens to also subscribe is the
    // one plausible false positive; it is accepted as the cost of a cheap rule.
    // (Documented, not tested — the rule deliberately reports it.)
  ],
  invalid: [
    {
      // The original bug's shape, verbatim.
      code: `
        useEffect(() => {
          function sync() {
            editorState.read(() => {
              const upToCaret = node.getTextContent().slice(0, offset);
              const idx = upToCaret.lastIndexOf(TRIGGER);
              if (idx === -1) { dismissedRef.current = false; close(); return; }
              setOpen(!dismissedRef.current);
            });
          }
          return lexicalEditor.registerUpdateListener(sync);
        }, [lexicalEditor]);
      `,
      errors: [{ messageId: "adhocCaretTrigger" }],
    },
    {
      // `indexOf` is the same shape.
      code: `
        const idx = text.indexOf("@");
        editor.registerUpdateListener(() => setOpen(idx !== -1));
      `,
      errors: [{ messageId: "adhocCaretTrigger" }],
    },
    {
      // Two listeners in one scanning file → one report each.
      code: `
        const idx = text.lastIndexOf("/");
        a.registerUpdateListener(f);
        b.registerUpdateListener(g);
      `,
      errors: [{ messageId: "adhocCaretTrigger" }, { messageId: "adhocCaretTrigger" }],
    },
  ],
});

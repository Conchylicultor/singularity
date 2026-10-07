/**
 * Tests for the `no-onclick-open-pane` lint rule.
 *
 * The rule bans a click handler whose only job is `openPane(...)` — a JSX
 * `onClick` attribute or an `onClick:` property — but must NOT fire on the link
 * form, on handlers that do other work, or on opens outside a click handler.
 */

import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import rule from "./no-onclick-open-pane";

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

const error = { messageId: "onClickOpenPane" } as const;
const rowError = { messageId: "rowActivateOpenPane" } as const;

// `RuleTester.run` drives the test harness itself (it calls the ambient
// describe/it that bun:test provides), so it must run at module top level —
// never wrapped in a `test()` callback.
ruleTester.run(
  "no-onclick-open-pane",
  // The eslint flat-config RuleTester is typed against the legacy Rule shape;
  // the typescript-eslint createRule object is compatible at runtime.
  rule as unknown as Parameters<RuleTester["run"]>[1],
  {
    valid: [
      // The link form — the fix.
      {
        code: `<Button {...openPane.link(p, { id }, { mode: "push" })} />;`,
      },
      // A handler doing other work besides the open.
      {
        code: `
          <Button
            onClick={() => {
              if (inline) toggle();
              else openPane(p, { id }, { mode: "push" });
            }}
          />;
        `,
      },
      {
        code: `
          <Button
            onClick={(e) => {
              e.stopPropagation();
              openPane(p, { id }, { mode: "push" });
            }}
          />;
        `,
      },
      // An imperative open outside a click handler.
      {
        code: `<List onSelect={(id) => openPane(p, { id }, { mode: "push" })} />;`,
      },
      {
        code: `const item = { onSelect: () => openPane(p, {}, { mode: "root" }) };`,
      },
      // A click handler calling something else.
      { code: `<Button onClick={() => navigate(url)} />;` },
      { code: `<Button onClick={() => store.openPaneImpl(p, {})} />;` },
      // A handler passed by reference is not inspected.
      { code: `<Button onClick={open} />;` },
      // DataView rows: the data form is the fix.
      {
        code: `<DataView rowActivation={(r) => openPane.to(p, { id: r.id }, { mode: "push" })} />;`,
      },
      // A row activation that is not navigation.
      { code: `<DataView onRowActivate={(r) => toggle(r.id)} />;` },
      {
        code: `<DataView rowActivation={(r) => (r.ok ? () => grant(r) : undefined)} />;`,
      },
    ],
    invalid: [
      {
        code: `<Button onClick={() => openPane(p, { id }, { mode: "push" })} />;`,
        errors: [error],
      },
      {
        code: `<Button onClick={() => { openPane(p, {}, { mode: "root" }); }} />;`,
        errors: [error],
      },
      {
        code: `<Button onClick={function () { return openPane(p, {}, { mode: "root" }); }} />;`,
        errors: [error],
      },
      // A member-call opener.
      {
        code: `<Button onClick={() => ctx.openPane(p, {}, { mode: "push" })} />;`,
        errors: [error],
      },
      // Object-property form (a sidebar contribution's data).
      {
        code: `const entry = { id: "x", onClick: () => openPane(p, {}, { mode: "root" }) };`,
        errors: [error],
      },
      {
        code: `const entry = { "onClick": () => openPane(p, {}, { mode: "root" }) };`,
        errors: [error],
      },
      // DataView rows whose activation only opens a pane.
      {
        code: `<DataView onRowActivate={(r) => openPane(p, { id: r.id }, { mode: "push" })} />;`,
        errors: [rowError],
      },
      {
        code: `<DataView rowActivation={(r) => () => openPane(p, { id: r.id }, { mode: "push" })} />;`,
        errors: [rowError],
      },
    ],
  },
);

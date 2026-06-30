/**
 * Tests for the `no-provider-trigger-render` lint rule. Run with `bun test`
 * from the repo root (or this file's directory).
 *
 * The rule flags a base-ui `*Trigger` (or a known render-forwarding wrapper like
 * `InlinePopover`) whose `render`/`trigger` prop's ROOT JSX element is a
 * `*Provider` — a context provider renders no DOM node, so the trigger wiring is
 * silently dropped onto it and the control never opens.
 *
 * It must fire on a provider root (any *Trigger flavour, Menu.Trigger member
 * form, the InlinePopover wrapper) but never on:
 *   - a DOM-rooted render target (IconButton, raw <button>, Button),
 *   - a provider nested DEEPER than the root (base-ui merges only onto the root),
 *   - a `render` prop on a non-Trigger component.
 */

import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import rule from "./no-provider-trigger-render";

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

// `RuleTester.run` drives the test harness itself (it calls the ambient
// describe/it that bun:test provides), so it must run at module top level.
ruleTester.run(
  "no-provider-trigger-render",
  // The eslint flat-config RuleTester is typed against the legacy Rule shape;
  // the typescript-eslint createRule object is compatible at runtime.
  rule as unknown as Parameters<RuleTester["run"]>[1],
  {
    valid: [
      // DOM-rooted IconButton render target — the prescribed fix.
      {
        code: `const x = <DropdownMenuTrigger render={<IconButton icon={X} label="Add" />} />;`,
      },
      // Provider hoisted as ANCESTOR (not the render root) — harmless.
      {
        code: `
          const x = (
            <ControlSizeProvider>
              <DropdownMenuTrigger render={<IconButton icon={X} label="Add" />} />
            </ControlSizeProvider>
          );
        `,
      },
      // Plain Button render target.
      {
        code: `const x = <PopoverTrigger render={<Button>Open</Button>} />;`,
      },
      // Provider nested DEEPER than the render root — base-ui merges only onto
      // the root, so this is harmless.
      {
        code: `const x = <DropdownMenuTrigger render={<button><ControlSizeProvider>x</ControlSizeProvider></button>} />;`,
      },
      // A `render` prop on a NON-Trigger component with a provider value.
      {
        code: `const x = <SomeView render={<ControlSizeProvider>x</ControlSizeProvider>} />;`,
      },
    ],
    invalid: [
      // The canonical bug: ControlSizeProvider wrapping IconButton.
      {
        code: `const x = <DropdownMenuTrigger render={<ControlSizeProvider><IconButton /></ControlSizeProvider>} />;`,
        errors: [{ messageId: "providerAsTriggerRender" }],
      },
      // Member-expression Trigger (Menu.Trigger) with a provider root.
      {
        code: `const x = <Menu.Trigger render={<SingleLineProvider><button /></SingleLineProvider>} />;`,
        errors: [{ messageId: "providerAsTriggerRender" }],
      },
      // The InlinePopover render-forwarding wrapper.
      {
        code: `const x = <InlinePopover trigger={<ControlSizeProvider><Button /></ControlSizeProvider>} />;`,
        errors: [{ messageId: "providerAsTriggerRender" }],
      },
    ],
  },
);

/**
 * Tests for the `no-provider-trigger-render` lint rule. Run with `bun test`
 * from the repo root (or this file's directory).
 *
 * The rule flags ANY base-ui `render` prop (or a known render-forwarding
 * wrapper like `InlinePopover`'s `trigger`) whose ROOT JSX element is a
 * `*Provider` — a context provider renders no DOM node, so everything the host
 * merges onto that root is silently dropped.
 *
 * It must fire on a provider root wherever `render` appears — a `*Trigger`, a
 * `*Popup` (the `OverlayPanel` composition), the `Menu.Trigger` member form, the
 * InlinePopover wrapper — but never on:
 *   - a DOM-rooted render target (IconButton, raw <button>, Button, OverlayPanel),
 *   - a provider nested DEEPER than the root (cloneElement merges only onto the root),
 *   - a non-`render` prop.
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
      // A DOM-rooted popup panel — the OverlayPanel composition, the shape the
      // widened rule exists to protect.
      {
        code: `const x = <PopoverPrimitive.Popup {...props} render={<OverlayPanel width="sm">{children}</OverlayPanel>} />;`,
      },
      // A provider passed on some OTHER prop is not a render slot.
      {
        code: `const x = <SomeView header={<ControlSizeProvider>x</ControlSizeProvider>} />;`,
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
      // The widened case: a POPUP's render root. The panel would render with no
      // positioning ref, no dismiss handlers and no data-open state.
      {
        code: `const x = <PopoverPrimitive.Popup render={<SingleLineProvider><div /></SingleLineProvider>} />;`,
        errors: [{ messageId: "providerAsTriggerRender" }],
      },
      // Any other host's render slot — the seam, not the host, is the hazard.
      {
        code: `const x = <SomeView render={<ControlSizeProvider>x</ControlSizeProvider>} />;`,
        errors: [{ messageId: "providerAsTriggerRender" }],
      },
    ],
  },
);

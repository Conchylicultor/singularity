/**
 * Tests for the `no-window-key-listener` lint rule.
 *
 * The rule bans keydown / keyup / keypress listeners on a page-wide target
 * (window, document, globalThis, self, document.body, document.documentElement)
 * outside the shortcut registry. Element-scoped listeners and non-key events on
 * the window stay valid.
 */

import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import rule from "./no-window-key-listener";

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
  },
});

// `RuleTester.run` drives the harness itself (it calls the ambient describe/it
// that bun:test provides), so it must run at module top level.
ruleTester.run(
  "no-window-key-listener",
  // The eslint flat-config RuleTester is typed against the legacy Rule shape;
  // the typescript-eslint createRule object is compatible at runtime.
  rule as unknown as Parameters<RuleTester["run"]>[1],
  {
    valid: [
      // An element hears only keys aimed at itself.
      { code: `el.addEventListener("keydown", onKey);` },
      { code: `ref.current.addEventListener("keydown", onKey, true);` },
      // A non-key event on the window is out of scope.
      { code: `window.addEventListener("resize", onResize);` },
      { code: `window.addEventListener("blur", onBlur);` },
      // Removing is not installing.
      { code: `window.removeEventListener("keydown", onKey);` },
      // A computed event name can't be read statically.
      { code: `window.addEventListener(eventName, onKey);` },
      // A property that merely shares a global's name is not that global.
      { code: `panel.document.addEventListener("keydown", onKey);` },
      { code: `frame.body.addEventListener("keydown", onKey);` },
    ],
    invalid: [
      {
        code: `window.addEventListener("keydown", onKey);`,
        errors: [{ messageId: "windowKeyListener" }],
      },
      {
        code: `document.addEventListener("keydown", onKey, true);`,
        errors: [{ messageId: "windowKeyListener" }],
      },
      {
        code: `window.addEventListener("keyup", onKeyUp);`,
        errors: [{ messageId: "windowKeyListener" }],
      },
      {
        code: `globalThis.addEventListener("keypress", onKey);`,
        errors: [{ messageId: "windowKeyListener" }],
      },
      {
        code: `self.addEventListener("keydown", onKey);`,
        errors: [{ messageId: "windowKeyListener" }],
      },
      {
        code: `document.body.addEventListener("keydown", onKey);`,
        errors: [{ messageId: "windowKeyListener" }],
      },
      {
        code: `window.document.documentElement.addEventListener("keydown", onKey);`,
        errors: [{ messageId: "windowKeyListener" }],
      },
      {
        code: "window.addEventListener(`keydown`, onKey, { capture: true });",
        errors: [{ messageId: "windowKeyListener" }],
      },
    ],
  },
);

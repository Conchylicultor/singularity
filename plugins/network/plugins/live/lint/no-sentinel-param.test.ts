/**
 * Tests for the `no-sentinel-param` lint rule: a `""` stand-in for a live
 * read's param that has not arrived yet.
 */

import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import rule from "./no-sentinel-param";

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    parserOptions: { ecmaVersion: "latest", sourceType: "module" },
  },
});

const sentinel = { messageId: "sentinel" as const };

// `RuleTester.run` drives the test harness itself, so it runs at top level.
ruleTester.run(
  "no-sentinel-param",
  rule as unknown as Parameters<RuleTester["run"]>[1],
  {
    valid: [
      { code: `useLive(v, id === null ? null : { id });` },
      { code: `useLive(v, { id });` },
      { code: `useLive(v, { path, scopeId });` },
      { code: `useLive(c, { where: { status: "open" } });` },
      { code: `useLive(v);` },
      { code: `useLiveRow(c, id);` },
      { code: `useLiveRow(c, id ?? null);` },
      // Not a live read.
      { code: `useThing(v, { id: x ?? "" });` },
      // A computed value is not traced.
      { code: `const id = x ?? ""; useLive(v, { id });` },
    ],
    invalid: [
      { code: `useLive(v, { id: x ?? "" });`, errors: [sentinel] },
      { code: `useLive(v, { id: x || "" });`, errors: [sentinel] },
      { code: `useLive(v, { id: "" });`, errors: [sentinel] },
      { code: "useLive(v, { id: `` });", errors: [sentinel] },
      { code: `useLive(v, { id: a ? a.id : "" });`, errors: [sentinel] },
      {
        code: `useLive(v, identity ? { conversationId: identity.id } : { conversationId: "" });`,
        errors: [sentinel],
      },
      {
        code: `useLive(v, { path: p ?? "", scopeId: s ?? "" });`,
        errors: [sentinel, sentinel],
      },
      { code: `useLiveRow(c, id ?? "");`, errors: [sentinel] },
    ],
  },
);

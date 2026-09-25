/**
 * Tests for the sortable-list lint rules: `no-scaling-transform` (the dnd-kit
 * `CSS.Transform` serializer that squashes dragged items) and `no-raw-dnd-kit`
 * (imports of @dnd-kit outside the drag primitives; path exemptions live in
 * the lint barrel's `ignores`, so every filename here is flagged).
 */

import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import noScalingTransform from "./no-scaling-transform";
import noRawDndKit from "./no-raw-dnd-kit";

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    parserOptions: { ecmaVersion: "latest", sourceType: "module" },
  },
});

// The eslint flat-config RuleTester is typed against the legacy Rule shape;
// the typescript-eslint createRule object is compatible at runtime.
type RuleArg = Parameters<RuleTester["run"]>[1];

ruleTester.run(
  "no-scaling-transform",
  noScalingTransform as unknown as RuleArg,
  {
    valid: [
      { code: `const t = CSS.Translate.toString(transform);` },
      { code: `const t = other.Transform.toString(transform);` },
    ],
    invalid: [
      {
        code: `const t = CSS.Transform.toString(transform);`,
        errors: [{ messageId: "scalingTransform" }],
      },
      {
        code: `const f = CSS.Transform;`,
        errors: [{ messageId: "scalingTransform" }],
      },
    ],
  },
);

ruleTester.run("no-raw-dnd-kit", noRawDndKit as unknown as RuleArg, {
  valid: [
    {
      code: `import { SortableList } from "@plugins/primitives/plugins/sortable-list/web";`,
    },
    { code: `import x from "dnd-kit-lookalike";` },
  ],
  invalid: [
    {
      code: `import { useSortable } from "@dnd-kit/sortable";`,
      errors: [{ messageId: "rawDndKit" }],
    },
    {
      code: `export { arrayMove } from "@dnd-kit/sortable";`,
      errors: [{ messageId: "rawDndKit" }],
    },
    {
      code: `const m = import("@dnd-kit/core");`,
      errors: [{ messageId: "rawDndKit" }],
    },
  ],
});

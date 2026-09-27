/**
 * Tests for the icon-safety react-icons rules: `no-react-icons` bans every
 * react-icons import outside primitives/icon-picker, `no-namespace-react-icons`
 * only has work inside it, and `no-robot-icon` catches the robot symbols.
 */

import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import noReactIcons from "./no-react-icons";
import noNamespaceReactIcons from "./no-namespace-react-icons";
import noRobotIcon from "./no-robot-icon";

type Rule = Parameters<RuleTester["run"]>[1];

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    parserOptions: { ecmaVersion: "latest", sourceType: "module" },
  },
});

const PICKER =
  "/repo/plugins/primitives/plugins/icon-picker/web/components/icon-picker.tsx";
const ELSEWHERE = "/repo/plugins/tasks/web/components/task-row.tsx";

ruleTester.run("no-react-icons", noReactIcons as unknown as Rule, {
  valid: [
    {
      code: `import { symbol } from "@plugins/ui/plugins/icons/core";`,
      filename: ELSEWHERE,
    },
    { code: `import { MdClose } from "react-icons/md";`, filename: PICKER },
  ],
  invalid: [
    {
      code: `import { MdClose } from "react-icons/md";`,
      filename: ELSEWHERE,
      errors: [{ messageId: "reactIcons" }],
    },
    {
      code: `import type { IconType } from "react-icons";`,
      filename: ELSEWHERE,
      errors: [{ messageId: "reactIcons" }],
    },
    {
      code: `export { SiGithub } from "react-icons/si";`,
      filename: ELSEWHERE,
      errors: [{ messageId: "reactIcons" }],
    },
    {
      code: `const md = await import("react-icons/md");`,
      filename: ELSEWHERE,
      errors: [{ messageId: "reactIcons" }],
    },
  ],
});

ruleTester.run(
  "no-namespace-react-icons",
  noNamespaceReactIcons as unknown as Rule,
  {
    valid: [
      { code: `import { MdClose } from "react-icons/md";`, filename: PICKER },
      // Outside the picker, no-react-icons already reports the import.
      { code: `import * as md from "react-icons/md";`, filename: ELSEWHERE },
    ],
    invalid: [
      {
        code: `import * as md from "react-icons/md";`,
        filename: PICKER,
        errors: [{ messageId: "namespaceImport" }],
      },
    ],
  },
);

ruleTester.run("no-robot-icon", noRobotIcon as unknown as Rule, {
  valid: [
    {
      code: `import { symbol } from "@plugins/ui/plugins/icons/core";\nconst i = symbol("auto-awesome");`,
    },
    // Not the icons core's marker.
    { code: `const i = symbol("smart-toy");` },
  ],
  invalid: [
    {
      code: `import { symbol } from "@plugins/ui/plugins/icons/core";\nconst i = symbol("smart-toy");`,
      errors: [{ messageId: "robotIcon" }],
    },
    {
      code: `import { symbol } from "@plugins/ui/plugins/icons/core";\nconst i = symbol("robot-2");`,
      errors: [{ messageId: "robotIcon" }],
    },
  ],
});

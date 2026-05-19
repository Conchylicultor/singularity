/**
 * Repo ESLint config — auto-discovers per-plugin lint rules.
 *
 * Each plugin may export `plugins/<name>/lint/index.ts` with a default export
 * `{ name: <plugin-id>, rules: Record<string, RuleModule> }`. This file walks
 * `plugins/**` for those barrels, registers each as an ESLint plugin under
 * its `name`, and enables every contributed rule as `"error"` scoped to the
 * plugin's own subtree.
 *
 * The CLI runs ESLint via `tooling/src/checks/eslint.ts` (`./singularity check
 * --eslint`); there's no separate npm script to keep in sync.
 *
 * Global lint rules (promise-safety, etc.) live in `tooling/src/lint/` and are
 * registered in baseConfigs below — they apply to all `**\/*.{ts,tsx}` files.
 */

import { existsSync } from "fs";
import { dirname, join, sep } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import type { Linter } from "eslint";
import reactHooks from "eslint-plugin-react-hooks";
import {
  discoverAllowDefaultProject,
  findPluginDirs,
  promiseSafetyRules,
} from "./plugins/framework/plugins/tooling/plugins/lint/core";

const here = dirname(fileURLToPath(import.meta.url));
const pluginsRoot = join(here, "plugins");

interface PluginContribution {
  /** Relative path under plugins/, e.g. "welcome" or "conversations/plugins/conversation-view". */
  relPath: string;
  /** ESLint plugin namespace — must match the lint barrel's `name`. */
  name: string;
  rules: Record<string, unknown>;
}

async function discoverPluginContributions(): Promise<PluginContribution[]> {
  if (!existsSync(pluginsRoot)) return [];
  const out: PluginContribution[] = [];
  for (const pluginDir of findPluginDirs(pluginsRoot)) {
    const lintBarrel = join(pluginDir, "lint", "index.ts");
    if (!existsSync(lintBarrel)) continue;
    const relPath = pluginDir.slice(pluginsRoot.length + 1).split(sep).join("/");
    const mod: { default?: { name?: unknown; rules?: unknown } } = await import(
      pathToFileURL(lintBarrel).href
    );
    const def = mod.default;
    if (!def || typeof def.name !== "string" || typeof def.rules !== "object" || def.rules === null) {
      console.warn(
        `[eslint.config] plugins/${relPath}/lint/index.ts: default export must be { name, rules }`,
      );
      continue;
    }
    out.push({
      relPath,
      name: def.name,
      rules: def.rules as Record<string, unknown>,
    });
  }
  return out;
}

const contributions = await discoverPluginContributions();

const baseConfigs: Linter.Config[] = [
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser as unknown as Linter.Parser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        projectService: {
          allowDefaultProject: discoverAllowDefaultProject(here),
          defaultProject: "plugins/framework/plugins/web-core/tsconfig.app.json",
        },
        tsconfigRootDir: here,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin as unknown as Linter.Plugin,
      "promise-safety": { rules: promiseSafetyRules } as unknown as Linter.Plugin,
      "react-hooks": reactHooks as unknown as Linter.Plugin,
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-misused-promises": ["error", {
        checksVoidReturn: { attributes: false },
      }],
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/no-unnecessary-condition": ["warn", {
        allowConstantLoopConditions: true,
      }],
      "@typescript-eslint/await-thenable": "error",
      "promise-safety/no-floating-promises": "error",
      "promise-safety/no-bare-catch": "error",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
      "no-constant-binary-expression": "error",
      "eqeqeq": ["error", "smart"],
      "no-template-curly-in-string": "error",
    },
  },
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.git/**",
      "**/.check-*/**",
      ".claude/worktrees/**",
      "plugins/framework/plugins/web-core/dist/**",
    ],
  },
];

const pluginConfigs: Linter.Config[] = contributions.map((c) => ({
  files: [`plugins/${c.relPath}/**/*.{ts,tsx}`],
  plugins: { [c.name]: { rules: c.rules } } as unknown as Linter.Config["plugins"],
  rules: Object.fromEntries(
    Object.keys(c.rules).map((ruleId) => [`${c.name}/${ruleId}`, "error"] as const),
  ),
}));

export default [...baseConfigs, ...pluginConfigs];

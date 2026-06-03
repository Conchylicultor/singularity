/**
 * Repo ESLint config — auto-discovers per-plugin lint rules.
 *
 * Each plugin may export `plugins/<name>/lint/index.ts` with a default export
 * `{ name: <plugin-id>, rules: Record<string, RuleModule> }`. The codegen
 * system discovers these barrels and writes `lint.generated.ts`; this file
 * loads entries from that registry, registers each as an ESLint plugin under
 * its `name`, and enables every contributed rule as `"error"` repo-wide
 * (`**\/*.{ts,tsx}`) — a contributed lint rule applies everywhere, like a
 * plugin-contributed check. Per-file exemptions are layered on afterwards.
 *
 * The CLI runs ESLint via `plugins/framework/plugins/tooling/plugins/checks/core/eslint.ts`
 * (`./singularity check --eslint`); there's no separate npm script to keep in sync.
 *
 * Global lint rules (promise-safety, etc.) live in `plugins/framework/plugins/tooling/plugins/lint/core/` and are
 * registered in baseConfigs below — they apply to all `**\/*.{ts,tsx}` files.
 */

import { dirname, join } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import type { Linter } from "eslint";
import reactHooks from "eslint-plugin-react-hooks";
import {
  discoverAllowDefaultProject,
  iconSafetyRules,
  promiseSafetyRules,
  reactiveServerIoRules,
} from "./plugins/framework/plugins/tooling/plugins/lint/core";
import { lintEntries } from "./plugins/framework/plugins/tooling/plugins/lint/core/lint.generated";

const here = dirname(fileURLToPath(import.meta.url));

// Files with no owning tsconfig (lint barrels, scripts, root *.config.ts) fall
// back to the typescript-eslint "default project". That service caps the number
// of files it will absorb (default 8) and hard-errors past it. The allowlist
// grows organically as plugins add lint/, scripts/, and *.config.ts entries —
// each plugin-contributed lint barrel adds two .ts files here — so a fixed cap
// would silently break the next contributor. Derive the cap from the discovered
// allowlist length (with headroom) so it always tracks the real count.
const allowDefaultProject = discoverAllowDefaultProject(here);
const defaultProjectFileCap = allowDefaultProject.length + 8;

interface PluginContribution {
  /** Relative path under plugins/, e.g. "welcome" or "conversations/plugins/conversation-view". */
  relPath: string;
  /** ESLint plugin namespace — must match the lint barrel's `name`. */
  name: string;
  rules: Record<string, unknown>;
  /**
   * Per-rule exemption globs, keyed by rule id, declared by the contributing
   * plugin. The owning plugin decides where its rule should not fire (e.g. a
   * legacy allowlist) — this config never names a rule or path itself.
   */
  ignores?: Record<string, string[]>;
}

const contributions: PluginContribution[] = [];
{
  // ESLint loads this config via jiti, which does NOT resolve the `@plugins/*`
  // tsconfig path alias. lintEntries[].loader() imports through that alias, so it
  // throws here ("Cannot find module @plugins/…"). Import each barrel by absolute
  // path instead — using the entry's pluginPath under the plugins/ root.
  const results = await Promise.allSettled(
    lintEntries.map((e) =>
      import(pathToFileURL(join(here, "plugins", e.pluginPath, "lint", "index.ts")).href),
    ),
  );
  const failures: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i]!;
    const e = lintEntries[i]!;
    if (r.status === "rejected") {
      failures.push(`${e.pluginPath}/lint — ${(r.reason as Error)?.message ?? String(r.reason)}`);
      continue;
    }
    const def = (r.value as {
      default?: { name?: string; rules?: Record<string, unknown>; ignores?: Record<string, string[]> };
    }).default;
    if (!def?.name || !def.rules) {
      failures.push(`${e.pluginPath}/lint — default export missing { name, rules }`);
      continue;
    }
    contributions.push({ relPath: e.pluginPath, name: def.name, rules: def.rules, ignores: def.ignores });
  }
  // Fail loudly: a dropped contribution means its rules silently stop being
  // enforced (this is exactly how no-console-log went unenforced for a while).
  if (failures.length > 0) {
    throw new Error(`[eslint] failed to load lint contributions:\n  ${failures.join("\n  ")}`);
  }
}

const baseConfigs: Linter.Config[] = [
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser as unknown as Linter.Parser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        projectService: {
          allowDefaultProject,
          defaultProject: "plugins/framework/plugins/web-core/tsconfig.app.json",
          maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING:
            defaultProjectFileCap,
        },
        tsconfigRootDir: here,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin as unknown as Linter.Plugin,
      "icon-safety": { rules: iconSafetyRules } as unknown as Linter.Plugin,
      "promise-safety": { rules: promiseSafetyRules } as unknown as Linter.Plugin,
      "reactive-server-io": { rules: reactiveServerIoRules } as unknown as Linter.Plugin,
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
      "icon-safety/no-lucide-react": "error",
      "promise-safety/no-floating-promises": "error",
      "promise-safety/no-bare-catch": "error",
      "reactive-server-io/no-reactive-server-io": "error",
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
      "**/*.generated.ts",
    ],
  },
];

const pluginConfigs: Linter.Config[] = contributions.map((c) => ({
  files: ["**/*.{ts,tsx}"],
  plugins: { [c.name]: { rules: c.rules } } as unknown as Linter.Config["plugins"],
  rules: Object.fromEntries(
    Object.keys(c.rules).map((ruleId) => [`${c.name}/${ruleId}`, "error"] as const),
  ),
}));

/**
 * Per-rule exemptions, declared by each contributing plugin via its lint barrel's
 * `ignores` map. Flat config merges matching objects in order, so each block flips
 * exactly one contributed rule off for the declared globs — the plugin stays
 * registered by `pluginConfigs` above, every other rule still applies. This config
 * names no rule and no path: the owning plugin holds that knowledge.
 */
const exemptConfigs: Linter.Config[] = contributions.flatMap((c) =>
  Object.entries(c.ignores ?? {}).map((entry) => {
    const [ruleId, globs] = entry;
    return {
      files: globs,
      rules: { [`${c.name}/${ruleId}`]: "off" },
    } as Linter.Config;
  }),
);

export default [...baseConfigs, ...pluginConfigs, ...exemptConfigs];

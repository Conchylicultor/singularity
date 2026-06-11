/**
 * Single source of truth for the repo's flat ESLint config.
 *
 * Two consumers build the same rules/plugins from here, differing only in how
 * the parser obtains TypeScript type information:
 *
 *   - the root `eslint.config.ts` (editor/IDE + ad-hoc `bunx eslint`) passes
 *     `{ projectService: true }` — typescript-eslint discovers each file's
 *     tsconfig and builds its own program;
 *   - the `type-check` check's per-target worker passes `{ programs: [program] }`
 *     — typescript-eslint REUSES a program the worker already built for `tsc`
 *     diagnostics, so the type-program is constructed once, not twice.
 *
 * Keeping both paths on this one builder means a rule/plugin/exemption change
 * applies identically to the IDE and the check. The contribution loader is
 * shared too (and fails loudly on a dropped contribution), so the type-aware
 * check can never silently enforce a different rule set than the editor.
 *
 * Loaded under BOTH jiti (eslint.config.ts) and Bun (the worker), so it must
 * avoid the `@plugins/*` alias jiti can't resolve: `lintEntries` is imported
 * relatively (same plugin) and lint barrels are imported by absolute path.
 */
import { join } from "path";
import { pathToFileURL } from "url";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import type { ESLint, Linter } from "eslint";
import reactHooks from "eslint-plugin-react-hooks";
import type { Program } from "typescript";
import { lintEntries } from "./lint.generated";

interface PluginContribution {
  /** Relative path under plugins/, e.g. "welcome" or "conversations/plugins/conversation-view". */
  relPath: string;
  /** ESLint plugin namespace — must match the lint barrel's `name`. */
  name: string;
  rules: Record<string, unknown>;
  /** Per-rule exemption globs, keyed by rule id, declared by the contributing plugin. */
  ignores?: Record<string, string[]>;
}

/**
 * Load every plugin's `lint/index.ts` contribution by absolute path (the one
 * import form that resolves under both jiti and Bun). Fail loudly: a dropped
 * contribution silently stops enforcing its rules.
 */
async function loadContributions(root: string): Promise<PluginContribution[]> {
  const results = await Promise.allSettled(
    lintEntries.map((e) =>
      import(pathToFileURL(join(root, "plugins", e.pluginPath, "lint", "index.ts")).href),
    ),
  );
  const contributions: PluginContribution[] = [];
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
  if (failures.length > 0) {
    throw new Error(`[eslint] failed to load lint contributions:\n  ${failures.join("\n  ")}`);
  }
  return contributions;
}

/** How the parser resolves TypeScript type information for type-aware rules. */
export type ParserTypeSource =
  | { projectService: true }
  | { programs: Program[] };

export interface BuildLintConfigOptions {
  /** Repo root — locates lint barrels and anchors `tsconfigRootDir`. */
  root: string;
  /** projectService (IDE/CLI) or a pre-built program set (type-check worker). */
  typeSource: ParserTypeSource;
}

/** Build the full flat config array (base + plugin rules + per-rule exemptions). */
export async function buildLintConfig(opts: BuildLintConfigOptions): Promise<Linter.Config[]> {
  const { root, typeSource } = opts;
  const contributions = await loadContributions(root);

  const parserOptions: Record<string, unknown> = {
    ecmaVersion: "latest",
    sourceType: "module",
    tsconfigRootDir: root,
    // Every .ts/.tsx must resolve to type info: projectService discovers the
    // tsconfig; programs supplies pre-built ones (project must be off so the
    // programs aren't overridden). A file in neither errors loudly.
    ...("projectService" in typeSource
      ? { projectService: true }
      : { programs: typeSource.programs, project: null }),
  };

  const baseConfigs: Linter.Config[] = [
    {
      files: ["**/*.{ts,tsx}"],
      languageOptions: {
        parser: tsParser as unknown as Linter.Parser,
        parserOptions: parserOptions as Linter.ParserOptions,
      },
      plugins: {
        "@typescript-eslint": tsPlugin as unknown as ESLint.Plugin,
        "react-hooks": reactHooks as unknown as ESLint.Plugin,
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

  const exemptConfigs: Linter.Config[] = contributions.flatMap((c) =>
    Object.entries(c.ignores ?? {})
      // An empty glob array is a valid "no allowlist" state; ESLint rejects a
      // config whose `files` is empty, so skip those entries entirely.
      .filter(([, globs]) => globs.length > 0)
      .map((entry) => {
        const [ruleId, globs] = entry;
        return { files: globs, rules: { [`${c.name}/${ruleId}`]: "off" } } as Linter.Config;
      }),
  );

  return [...baseConfigs, ...pluginConfigs, ...exemptConfigs];
}

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

/**
 * React Compiler / Rules-of-React diagnostic rules, set WARN-FIRST.
 *
 * The React Compiler auto-memoizes components, but it *silently bails* on any
 * component that breaks the Rules of React — such components compile to plain
 * pass-throughs with no memoization. These eslint rules are the ONLY way to
 * find and count those silent bails, so the warning COUNT is the compiler's
 * coverage / silent-bail metric driving the adopt-vs-not decision.
 *
 * They ship in `eslint-plugin-react-hooks`'s `recommended-latest` flat config
 * (the standalone `eslint-plugin-react-compiler` is deprecated; its rules were
 * merged into eslint-plugin-react-hooks v6+). We read them off the installed
 * version programmatically — never hardcode the list, which drifts per version.
 *
 * Severity policy during evaluation:
 *   - Every compiler diagnostic rule is forced to "warn" so `./singularity
 *     check`'s eslint stays GREEN across ~540 plugins (warnings don't fail it).
 *   - `rules-of-hooks` + `exhaustive-deps` are RE-PINNED to "error" below
 *     (after the spread, so they win) — they were already enforced and stay so.
 *   - `preserve-manual-memoization` stays "warn" for now; the plan promotes it
 *     to "error" later if its warn-count is ~0 (it protects the existing manual
 *     useMemo/useCallback sites from compiler/manual conflict).
 *
 * Fails loudly (below) on version skew rather than silently enabling nothing.
 */
function compilerDiagnosticRulesAsWarn(): Record<string, Linter.RuleEntry> {
  const recommended = (
    reactHooks as unknown as {
      configs?: { "recommended-latest"?: { rules?: Record<string, unknown> } };
    }
  ).configs?.["recommended-latest"];
  if (!recommended?.rules) {
    throw new Error(
      "[eslint] eslint-plugin-react-hooks: configs['recommended-latest'].rules is missing — " +
        "version skew (expected v6+ where the React Compiler diagnostics ship there). " +
        "Cannot enable the compiler rules; refusing to silently enable nothing.",
    );
  }
  // Spread every rule from recommended-latest, forcing each to "warn".
  return Object.fromEntries(
    Object.keys(recommended.rules).map((ruleId) => [ruleId, "warn"] as const),
  );
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
        // React Compiler / Rules-of-React diagnostics, warn-first (see
        // compilerDiagnosticRulesAsWarn above). Spread FIRST so the two
        // explicit "error" pins below win the merge.
        ...compilerDiagnosticRulesAsWarn(),
        "react-hooks/rules-of-hooks": "error",
        "react-hooks/exhaustive-deps": "error",
        // Coverage-blocking React Compiler rules — RATCHETED warn→error once the
        // codebase was driven to zero (2026-06-23). These are the diagnostics
        // that make the compiler SILENTLY BAIL on (skip memoizing) a component;
        // enforcing them at error keeps compiler coverage complete — a new bail
        // fails `./singularity check` instead of silently eroding coverage.
        // Genuine exemptions opt out at the site: a `"use no memo"` directive
        // and/or an inline `// eslint-disable-next-line react-hooks/<rule> -- …`
        // (e.g. the @tanstack/react-virtual incompatibility in primitives/
        // virtual-rows). `react-hooks/refs` was likewise RATCHETED warn→error in
        // Phase 2 (2026-06-23) once its burndown hit zero: the latest-value-ref
        // idiom moved into the `useLatestRef`/`useEventCallback` primitive
        // (primitives/latest-ref), which carries the one sanctioned disable;
        // @dnd-kit / auto-scroll library refs are destructured at the call site
        // (member access on a ref-bearing hook return is what trips the rule);
        // genuine anti-patterns were refactored; and the few intentional
        // render-time machines (use-tab-presence, use-cursor-pagination, the
        // build-once markdown/overlay memos) carry an inline `react-hooks/refs`
        // disable. Only the high-volume `set-state-in-effect` stays "warn"
        // (correctness/style; the compiler still compiles it) until its own
        // burndown completes — see
        // research/2026-06-23-global-react-compiler-refs-burndown.md.
        "react-hooks/purity": "error",
        "react-hooks/immutability": "error",
        "react-hooks/use-memo": "error",
        "react-hooks/void-use-memo": "error",
        "react-hooks/static-components": "error",
        "react-hooks/preserve-manual-memoization": "error",
        "react-hooks/incompatible-library": "error",
        "react-hooks/refs": "error",
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
        // Repo-root prototype mocks: standalone CDN-React/Babel-in-browser files,
        // not part of any tsconfig/plugin tree. Skip a stray `bunx eslint prototypes/`.
        "prototypes/**",
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

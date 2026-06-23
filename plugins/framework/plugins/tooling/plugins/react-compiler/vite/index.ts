// react-compiler's build-time contribution: enable the React Compiler (v1.0, GA
// Oct 2025) as a Babel plugin across the entire frontend.
//
// `web-core/vite.config.ts` discovers every `**/vite/index.ts` generically (it
// never names this plugin) and passes each default export's result to
// `@vitejs/plugin-react`'s `babel.plugins`. The React Compiler auto-inserts the
// memoization that ~654 `useMemo` / ~475 `useCallback` call sites maintain by
// hand today — with correct deps by construction — retiring the per-subtree
// manual-memo treadmill. It still respects existing manual memoization via
// `preserve-manual-memoization`.
//
// `compilationMode: "infer"` (the compiler's DEFAULT) compiles every function
// inferred to be a component or hook (PascalCase / `use*`), uniformly across all
// plugins — that IS our "compile everything" goal. We deliberately do NOT use
// `"all"`: that mode also compiles plain top-level helpers (e.g. `defineCollectedDir`),
// injecting `useMemoCache` into functions that run at module-eval — where React's
// dispatcher is null — which hard-crashes boot ("Cannot read properties of null
// (reading 'useMemoCache')").
//
// ORDERING (CRITICAL) — the React Compiler MUST run FIRST in the Babel plugin
// list. Other contributors (e.g. element-picker's source-location transform)
// stamp JSX *after* the compiler has restructured component bodies. We return the
// ordered wrapper shape `{ order, plugin }` consumed by vite.config.ts and reserve
// `order: -100` ("must run first") so the compiler always precedes the default
// `order: 0` contributions, regardless of filesystem discovery order.
//
// React 19 (react/react-dom ^19.1.0) has NATIVE compiler support: `target: "19"`
// means NO `react-compiler-runtime` polyfill is needed (the runtime ships in
// React itself).
//
// STRUCTURAL ON/OFF SWITCH — presence of this folder == compiler enabled. The
// discovery walk finds this `vite/index.ts` and the compiler is in the chain;
// delete this plugin folder and the walk finds nothing, so React runs with no
// compiler (byte-identical to before adoption). There is no env flag.
//
// CONSTRAINTS — kept fully self-contained (single file, no sibling imports) and
// with ZERO `@plugins` / `@babel/*` imports on purpose: this module is loaded by
// `vite.config.ts` via a runtime dynamic `import()` of its absolute path, where
// neither the `@plugins` alias nor extensionless `.ts` sibling resolution is
// available. Only `node:*` imports are allowed. We therefore resolve
// `babel-plugin-react-compiler` by ABSOLUTE PATH via `node:module`'s
// `createRequire` (web-core is ESM, `"type": "module"`) and hand Babel the
// resolved path string rather than bare-importing the package — `createRequire`
// resolves from the repo `node_modules` regardless of the dynamic-import entry.

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/**
 * Factory consumed by the vite config. The React Compiler does not need
 * `repoRoot`, but the signature must match the generic contribution contract.
 * Returns the ordered wrapper `{ order, plugin }`: `order: -100` guarantees the
 * compiler runs first, and `plugin` is the `[resolvedPath, options]` Babel tuple.
 */
export default function reactCompilerVitePlugin(_opts: { repoRoot: string }) {
  const pluginPath = require.resolve("babel-plugin-react-compiler");
  return {
    order: -100,
    plugin: [pluginPath, { target: "19", compilationMode: "infer" }] as const,
  };
}

/**
 * Repo ESLint config — for the editor/IDE integration and ad-hoc `bunx eslint`.
 *
 * The rules, plugin contributions, and per-rule exemptions all live in the
 * shared builder `plugins/framework/plugins/tooling/plugins/lint/core/build-lint-config.ts`,
 * so this config and the `type-check` check (which builds the same config but
 * reuses a pre-built TypeScript program) can never drift. This file only picks
 * the parser's type source: `projectService: true`, which discovers each file's
 * tsconfig. A file that resolves to no project errors loudly.
 *
 * The builder is imported by relative path (not `@plugins/*`) because ESLint
 * loads this config via jiti, which does not resolve the tsconfig path alias.
 */

import { dirname } from "path";
import { fileURLToPath } from "url";
import { buildLintConfig } from "./plugins/framework/plugins/tooling/plugins/lint/core/build-lint-config";

const here = dirname(fileURLToPath(import.meta.url));

export default await buildLintConfig({ root: here, typeSource: { projectService: true } });

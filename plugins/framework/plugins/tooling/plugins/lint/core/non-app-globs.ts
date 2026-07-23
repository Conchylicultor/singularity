/**
 * Files that are NOT app code: test suites and e2e drivers.
 *
 * Plugin-contributed lint rules are overwhelmingly *architecture* rules — use
 * the Row primitive, use the spacing ramp, route scroll writes through
 * auto-scroll, render collections as a DataView. They exist to keep the app's
 * composition coherent. A test suite and a Playwright driver are not part of
 * that composition: they *observe* the app from outside, and for e2e the
 * boundary rules actively FORBID importing the primitives those rules point you
 * at (the `e2e` runtime may reach `core` and other `e2e` barrels, never `web`).
 * A rule whose remedy is unreachable from the file it fires on is not enforcing
 * architecture — it is just noise that pushes authors toward inline disables.
 *
 * So contributed rules are off here by default. A rule that catches a genuine
 * BUG rather than a design deviation (a floating promise, a swallowed error)
 * opts back in via `enforceEverywhere` in its lint barrel — see
 * ./build-lint-config.ts and the promise-safety contribution.
 *
 * This does NOT relax the base config: typescript-eslint and the react-hooks /
 * React Compiler diagnostics still apply to every file, everywhere.
 */
export const NON_APP_FILE_GLOBS: readonly string[] = [
  // Per-plugin Playwright drivers (plugins/<path>/e2e/<name>.ts).
  "**/e2e/**/*.{ts,tsx}",
  // jsdom/React suites (plugins/<path>/web/__tests__/**) and their helpers.
  "**/__tests__/**/*.{ts,tsx}",
  // Co-located bun:test suites (plugins/<path>/**/<name>.test.ts).
  "**/*.test.{ts,tsx}",
  // The repo-wide vitest setup/harness.
  "test/**/*.{ts,tsx}",
];

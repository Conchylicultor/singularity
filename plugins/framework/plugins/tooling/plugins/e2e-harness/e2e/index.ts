/**
 * Shared Playwright harness for the per-plugin `e2e/` scripts.
 *
 * Import from other plugins' e2e scripts as
 * `@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e`.
 *
 * The `e2e` runtime may reach other plugins' `core` and `e2e` barrels only
 * (see boundary-config.ts): an end-to-end test drives the deployed app through
 * the browser, so it must never import the `web`/`server` code under test.
 */
export { arg, numArg, flag, requireArg, usage } from "./args";
export { baseUrl, pathUrl } from "./target";
export { withBrowser, boot, DEFAULT_VIEWPORT } from "./browser";
export type { Harness, Session, SessionOptions, BootOptions } from "./browser";
export { capture } from "./capture";
export type { Captured } from "./capture";
export { report } from "./report";
export type { Report } from "./report";
export { snap } from "./shots";
export { detectOsColorScheme } from "./color-scheme";
export type { ColorScheme } from "./color-scheme";

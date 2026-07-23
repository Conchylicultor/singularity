/**
 * e2e barrel for the per-block content-CRDT plugin.
 *
 * Importable from other plugins' e2e scripts as
 * `@plugins/page/plugins/editor-collab/e2e` — the `apps/pages/history` restore
 * test reads server-side block docs through it, so it needs no yjs dependency of
 * its own.
 */
export { blockDocText, fetchBlockDoc, fetchBlockDocText } from "./support/ydoc";

/**
 * e2e barrel for the page editor.
 *
 * Importable from other plugins' e2e scripts as
 * `@plugins/page/plugins/editor/e2e` — the editor-collab and pages/history tests
 * drive the same editor surface, so they share this flow rather than each
 * re-deriving "how do I get a blank document with a focused block".
 */
export {
  openBlankPage,
  editableBlocks,
  blockIdOf,
  blockText,
  caretState,
  pageIdFromUrl,
} from "./support/blank-page";
export type {
  BlankDoc,
  CaretState,
  OpenBlankPageOptions,
} from "./support/blank-page";

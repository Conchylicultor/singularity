// What a kind's `fingerprint` is told about the occurrence BESIDES its own
// `data` payload. A payload is the kind's own shape, and for some kinds (a
// browser `window.onerror` with no `Error` object) it carries no identity at
// all — the generic one-line message is then the only thing distinguishing two
// unrelated failures, so the engine hands it over rather than letting them
// collapse onto one row.
//
// Lives in `core` because fingerprint functions live in their kind's `core`
// (crash, render-loop, …), which may not import a `server` barrel.
export interface ReportFingerprintContext {
  /** The report's raw one-line message, before the engine's length clamp. */
  message: string;
  /** The reporting channel ("browser-error", "server-caught", …). */
  source: string;
}

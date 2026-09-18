/**
 * e2e barrel for the song index.
 *
 * Importable from other plugins' e2e scripts as
 * `@plugins/apps/plugins/chord/plugins/song-index/e2e`, so a script that needs
 * the index (the trainer's) opens it and waits for it the same way this
 * plugin's own scripts do.
 */
export { ensureReady, major, minor, postJson } from "./flows";

/**
 * Resolves immediately. Secrets storage now lives on the central runtime; the
 * server-side barrel is a thin HTTP client, so there is no per-process boot
 * step to coordinate. Kept as an exported promise so existing consumers
 * (auth, config) can `await ready` from inside their own onReady without
 * caring whether secrets is local or remote.
 */
export const ready: Promise<void> = Promise.resolve();

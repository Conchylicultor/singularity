// Server readiness flag. Flipped once the `onReadyBlocking` barrier completes
// (migrations applied, DB pool warm, config registry built). `GET
// /api/health/ready` reports this, and the gateway gates its hot-swap on it so
// it never swaps to a backend that is accepting connections but not yet able to
// serve correctly. Background `onReady` work does NOT gate this flag.
let ready = false;

export function markServerReady(): void {
  ready = true;
}

export function isServerReady(): boolean {
  return ready;
}

import type { DbChange } from "./parse-payload";

// Route the NOTIFYs Postgres delivers together as ONE burst: buffer each parsed
// change and route the whole buffer, in arrival order, from a single macrotask.
//
// Why: a transaction writing N tables emits N NOTIFYs, delivered together at
// commit — but the socket may hand them over across several reads, and the
// runtime drains on the next MICROTASK after the first one routes. A drain that
// runs between two of them sends that transaction's ack (`ackTx`) — a standalone
// ack for a tuple the first change skipped, or a scoped refill's frame — before
// its other change has reached the same tuple, so an optimistic client confirms
// an op whose row it has not been sent yet and briefly reverts it. Routing the
// burst from one macrotask puts every change of it into the same pendings, so the
// ack leaves only after all of them landed (the runtime folds one tuple's changes
// into one pending, and a skipped tuple's owed ack into its real pending).
//
// The macrotask boundary is the whole guarantee: it covers every NOTIFY already
// read off the socket by then, which is how Postgres sends one commit's
// notifications (back to back). A burst split by a later socket read is still
// routed in two flushes.
export function createBurstRouter(
  route: (change: DbChange) => void,
  defer: (fn: () => void) => void = setImmediate,
): (change: DbChange) => void {
  let burst: DbChange[] = [];
  let armed = false;
  const flush = (): void => {
    armed = false;
    const changes = burst;
    burst = [];
    for (const change of changes) route(change);
  };
  return (change) => {
    burst.push(change);
    if (armed) return;
    armed = true;
    defer(flush);
  };
}

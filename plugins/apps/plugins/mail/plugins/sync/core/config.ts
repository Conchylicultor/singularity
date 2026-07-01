// Bounded-backfill window for the on-demand sync model (Superhuman-style local
// cache): instead of mirroring the ENTIRE mailbox eagerly, the backfill syncs
// only a recent window of message ENVELOPES (via Gmail `format=metadata`) and
// stops. Bodies are fetched lazily on first open (see `hydrate.ts`). Anything
// older than the window is simply not in the local mirror until on-demand search
// pulls it in (a later phase).
//
// Two independent bounds — whichever trips first ends the backfill:
// - `BACKFILL_WINDOW_DAYS` — server-side date filter (`newer_than:Nd`) so old
//   message ids are never even listed.
// - `MAX_BACKFILL_MESSAGES` — a hard ceiling on envelopes synced, guarding a very
//   busy mailbox where the window alone could still be tens of thousands.

/** How many days back the initial backfill mirrors (message envelopes only). */
export const BACKFILL_WINDOW_DAYS = 30;

/** Hard ceiling on message envelopes synced by the bounded backfill. */
export const MAX_BACKFILL_MESSAGES = 1500;

/**
 * The `spawnedBy` of a conversation main ADOPTED: a live agent session it found
 * running with no conversation row — one an agent started outside the
 * conversation launcher (a `tmux new-session` from its checkout), or one whose
 * row was lost. Nothing launched it on purpose, so the queue shows it in its
 * own Lost section rather than ranking it among the user's work.
 *
 * The value is "poller" for history: adoption was done by the retired 1 s
 * poller, and existing rows carry it.
 */
export const ADOPTED_SPAWNED_BY = "poller";

/** Was this conversation adopted (see {@link ADOPTED_SPAWNED_BY})? */
export function isAdoptedConversation(conv: {
  spawnedBy: string | null;
}): boolean {
  return conv.spawnedBy === ADOPTED_SPAWNED_BY;
}

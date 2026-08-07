/**
 * The worktree every commit-link lookup and pane push names — ALWAYS the literal
 * `"main"`, never the host conversation's attempt. One constant because it is one
 * decision: the claim resolves the sha here, and the pane it opens must read the
 * same checkout.
 *
 * Worktrees are `git worktree add` checkouts, so every one of them shares a
 * single object database. `git log -1 <sha>` is an object-graph lookup, not a
 * reachability-from-HEAD check — a commit made on any branch, in any attempt's
 * worktree, unpushed, resolves from the main checkout. On top of that the server
 * reaches `"main"` through `ensureMainWorktreeRoot()`, which self-heals; an
 * attempt's DB-stored `worktreePath` goes stale the moment `worktree-cleanup`
 * reaps it.
 *
 * The payoff is that this chip needs ZERO conversation-awareness — no
 * `conversationPane`, no `useConversationById`, no dependency on `conversations`
 * at all — which is what makes it correct on the surfaces that have no
 * conversation in scope (task descriptions, Debug → Memory, the story renderer).
 * The happy path and the no-conversation path are the same path.
 */
export const COMMIT_WORKTREE = "main";

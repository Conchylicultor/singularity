// The shapes every caller branches on. Kept in their own file so the barrel,
// the prober, the cache and the upstream resolver all name one set of arms.
//
// `core/` here means RUNTIME-NEUTRAL NODE, not web-safe — the modules beside
// this one spawn `git`. This plugin must never be imported from `web/`.

/**
 * Why this checkout may not publish. Each arm carries what a caller needs to
 * print, and — just as important — each arm is a DIFFERENT fact, because the
 * three failure modes are not interchangeable:
 *
 * - `read-only` is an answer ABOUT THIS REPOSITORY. The remote recognised us
 *   and refused the write. It is the only arm worth recording, because it is
 *   the only one that will still be true tomorrow.
 * - `no-credentials` is an answer about US. The remote never learned who we
 *   are (an ssh key it does not accept, a prompt we suppressed), so it said
 *   nothing about this repository at all. Recording it would turn a broken
 *   key into a permanent "you may not publish".
 * - `unreachable` is not an answer. The network, DNS or the host itself never
 *   replied. Recording it would be writing down something nobody said.
 * - `probe-failed` is the honest arm for a failure this module does not
 *   classify: git refused for some fourth reason, and we print its own words
 *   rather than pick the nearest label.
 *
 * Only `read-only` (and its opposite, a successful probe) reaches the cache.
 */
export type LocalReason =
  | { kind: "no-remote" }
  | { kind: "read-only"; remote: string; url: string; detail: string }
  | { kind: "no-credentials"; remote: string; url: string; detail: string }
  | { kind: "unreachable"; remote: string; url: string; detail: string }
  | { kind: "probe-failed"; remote: string; url: string; detail: string };

/**
 * Where — if anywhere — this checkout's work may be published.
 *
 * A discriminated result, never `null` and never an empty string: "we cannot
 * publish" is a state with a reason the caller prints, not an absence a caller
 * could mistake for "not looked up yet".
 */
export type PublishTarget =
  | { kind: "publish"; remote: string; url: string }
  | { kind: "local"; reason: LocalReason };

/**
 * The remote this checkout RECEIVES from — the repo it was cloned from, or the
 * canonical repo a fork was made from.
 *
 * `is-publisher` is the author's case: a checkout that may write to the
 * canonical repo has no upstream, because there is nothing above it.
 */
export type UpstreamRemote =
  | { kind: "upstream"; remote: string; url: string }
  | { kind: "none"; reason: "is-publisher" | "no-remote" };

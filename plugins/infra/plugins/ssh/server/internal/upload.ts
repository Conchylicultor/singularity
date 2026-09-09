/**
 * Copy one local file to a remote host, hermetically — `sshRun`'s sibling for
 * shipping bytes rather than running a command.
 *
 * Three decisions worth stating:
 *
 * - **`scp`, not `sshRun` with stdin.** A release bundle is ~100MB+ and
 *   `spawnCaptured`'s stdin is a whole in-memory buffer by construction
 *   (`spawn/core/internal/types.ts`) — deliberately, since a JS-side stream pull
 *   is the exact machinery that plugin exists to remove. So the transfer has to
 *   be a file the child reads itself, which is what `scp` is.
 * - **The isolation flags are not re-declared here.** They live once in
 *   `session.ts` and are passed to `scp` verbatim. A second copy would be a
 *   second place for `IdentitiesOnly` or the host-key policy to be dropped, and
 *   dropping either turns "this key reaches this host" back into "some ambient
 *   credential on this machine reached this host".
 * - **The destination is never opened for writing.** The bytes land beside it
 *   and are `rename(2)`d over it — see {@link sshUpload}.
 */
import { randomBytes } from "node:crypto";
import { sshRun } from "./run";
import { runHermetic } from "./session";
import type { SshTarget, SshUploadResult } from "./types";

/**
 * Wall-clock ceiling for a whole upload when the caller doesn't set one.
 *
 * Ten minutes, not `sshRun`'s 15s: that budget is a reachability probe's, and a
 * 100MB+ bundle over a domestic uplink is minutes of legitimate transfer. The
 * dial itself is still bounded tightly and independently (`CONNECT_TIMEOUT_CAP_SEC`
 * in `session.ts`), so a dead host fails fast even under this budget.
 */
const DEFAULT_TIMEOUT_MS = 600_000;

/**
 * Budget for the rename, and for the cleanup of a failed transfer.
 *
 * A local `mv` on the remote box is a reachability probe with a syscall on the
 * end, so it gets a probe's budget rather than the transfer's — a wedged rename
 * must not be allowed to sit for the ten minutes the bytes were entitled to.
 */
const RENAME_TIMEOUT_MS = 15_000;

/**
 * The same connection on a probe's budget, pinned to `learned` when the
 * transfer learned a host key — see the call site.
 */
function shortTarget(target: SshTarget, learned: string | null): SshTarget {
  return {
    ...target,
    timeoutMs: RENAME_TIMEOUT_MS,
    hostKey:
      learned === null
        ? target.hostKey
        : { mode: "pinned", knownHostsLine: learned },
  };
}

/** A same-directory sibling of `remotePath`, so the rename stays on one filesystem. */
function stagingPathFor(remotePath: string): string {
  return `${remotePath}.part-${randomBytes(8).toString("hex")}`;
}

/**
 * Copy `localPath` to `remotePath` on `target`, and return a discriminated
 * result on the same terms as {@link sshRun}: remote-side problems come back as
 * `{ ok: false, kind }`, a local fault (cannot write the scratch key) throws.
 *
 * **`remotePath` is replaced, never written into.** The transfer lands on a
 * same-directory staging sibling and is `mv`'d over the destination, so the
 * destination only ever changes by `rename(2)`, from one complete file to
 * another. That is not tidiness — writing directly is wrong in two ways this
 * closes for every caller:
 *
 *   • A destination that is being executed cannot be opened for writing at all:
 *     the kernel answers `ETXTBSY`, which `scp` reports as the opaque
 *     `dest open "…": Failure`. Re-shipping the bundle a host is already serving
 *     failed on exactly this (`drun-1788970613664-48yovt`) — while `rename(2)`
 *     over a running binary is legal and leaves the running process on its own
 *     inode until the service restarts.
 *   • A transfer that dies part-way (a dropped link, our own deadline) had
 *     already truncated the destination, leaving a half file where a working one
 *     used to be. Now a failed upload leaves the destination untouched.
 *
 * The remote *parent directory must already exist* — `scp` does not create it,
 * and inventing an `mkdir -p` here would make this primitive silently do two
 * things. Callers create it with an `sshRun` first.
 *
 * `remotePath` is interpreted by the remote shell (OpenSSH offers no
 * argv-preserving form), so keep it shell-metacharacter-free — the same caveat
 * as `sshRun`'s `command`.
 */
export async function sshUpload(
  target: SshTarget,
  localPath: string,
  remotePath: string,
): Promise<SshUploadResult> {
  const staging = stagingPathFor(remotePath);
  const result = await runHermetic({
    program: "scp",
    target,
    positionals: (host) => [localPath, `${host}:${staging}`],
    defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
    // `scp` has no reserved status of its own: it exits 1 for a refused
    // connection AND for a remote path it cannot write, so the status is not
    // evidence of which happened and only stderr is. See `classify`'s docstring.
    ownFailureExit: null,
  });
  if (!result.ok) {
    // Best effort: a transfer that died part-way may still have left a staging
    // file. Its own failure is the one the caller must see, so a failing sweep
    // is not allowed to replace it — and the file is a stray, not a corruption,
    // since nothing but this call ever names it.
    await sshRun(shortTarget(target, null), ["rm", "-f", "--", staging]);
    return result;
  }

  // The follow-ups reuse the key the transfer just learned rather than trusting
  // on first use a second time: `learn` accepts whatever the host presents, and
  // one call must not become three separate opportunities to be answered by a
  // different host than the one that took the bytes.
  const short = shortTarget(target, result.learnedHostKey);

  // `-T`: without it, a `remotePath` that is an existing DIRECTORY silently
  // takes the file inside itself instead of failing, and the caller is left
  // believing the path it named now holds the bytes.
  const rename = await sshRun(short, ["mv", "-fT", "--", staging, remotePath]);
  if (!rename.ok) {
    await sshRun(short, ["rm", "-f", "--", staging]);
    return rename;
  }
  // `scp` prints nothing on success off a TTY; dropping stdout keeps the result
  // from carrying an always-empty field a caller might read meaning into.
  return { ok: true, learnedHostKey: result.learnedHostKey };
}

/**
 * Copy one local file to a remote host, hermetically — `sshRun`'s sibling for
 * shipping bytes rather than running a command.
 *
 * Two decisions worth stating:
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
 */
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
 * Copy `localPath` to `remotePath` on `target`, and return a discriminated
 * result on the same terms as {@link sshRun}: remote-side problems come back as
 * `{ ok: false, kind }`, a local fault (cannot write the scratch key) throws.
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
  const result = await runHermetic({
    program: "scp",
    target,
    positionals: (host) => [localPath, `${host}:${remotePath}`],
    defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
    // `scp` has no reserved status of its own: it exits 1 for a refused
    // connection AND for a remote path it cannot write, so the status is not
    // evidence of which happened and only stderr is. See `classify`'s docstring.
    ownFailureExit: null,
  });
  if (!result.ok) return result;
  // `scp` prints nothing on success off a TTY; dropping stdout keeps the result
  // from carrying an always-empty field a caller might read meaning into.
  return { ok: true, learnedHostKey: result.learnedHostKey };
}

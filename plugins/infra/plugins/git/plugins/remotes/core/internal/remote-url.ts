/**
 * A remote URL, as far as we can read it.
 *
 * Two arms rather than a nullable parse, because "I could not read this URL"
 * must not collapse into "this URL is not the canonical repo" without anybody
 * noticing. An `opaque` URL still compares — by its exact text — so a caller
 * always gets a total answer and never a silent `false`.
 */
export type RepoUrl =
  | { kind: "parsed"; host: string; path: string }
  | { kind: "opaque"; raw: string };

/**
 * Reduce a remote URL to the (host, path) pair that identifies the repository,
 * so the four spellings of one GitHub repo compare equal:
 *
 *   https://github.com/Owner/repo.git
 *   https://github.com/owner/repo/
 *   git@github.com:Owner/repo.git
 *   ssh://git@github.com/owner/repo
 *
 * Case is dropped on BOTH host and path: git hosts treat owner and repository
 * case-insensitively, and a clone that differs only in case is the same repo.
 * A `.git` suffix and any leading/trailing slashes go too.
 *
 * A local path (`/tmp/upstream.git`, `../other`) has no host and is returned
 * `opaque` — two local paths are the same repo only when they are the same
 * text, and this module has no business resolving symlinks to decide otherwise.
 */
export function normalizeRepoUrl(raw: string): RepoUrl {
  const trimmed = raw.trim();
  if (!trimmed) return { kind: "opaque", raw: trimmed };

  // scp-like syntax — `[user@]host:path` — which is not a URL and which
  // `new URL()` misreads (it parses `git@github.com:Owner/repo` as a URL whose
  // protocol is `git@github.com:`). Distinguished from a Windows drive letter
  // and from a plain path by requiring a dot-bearing host before the colon.
  const scp = /^(?:[^@/]+@)?([^/:]+\.[^/:]+):(.+)$/.exec(trimmed);
  if (scp) return parts(scp[1]!, scp[2]!);

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      if (!url.hostname) return { kind: "opaque", raw: trimmed };
      return parts(url.hostname, url.pathname);
    } catch (err) {
      // `new URL` throws exactly one thing — a TypeError for a string it
      // cannot parse — and that is the answer we want, not a failure. Anything
      // else came from somewhere we did not expect and keeps going up.
      if (!(err instanceof TypeError)) throw err;
      return { kind: "opaque", raw: trimmed };
    }
  }

  return { kind: "opaque", raw: trimmed };
}

function parts(host: string, path: string): RepoUrl {
  // Trailing slashes first: `/Owner/repo.git/` only ends in `.git` once the
  // slash is gone, and both spellings are the same repository.
  const cleaned = path
    .replace(/\/+$/, "")
    .replace(/\.git$/i, "")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
  return {
    kind: "parsed",
    host: host.toLowerCase(),
    path: cleaned.toLowerCase(),
  };
}

/**
 * Do these two remote URLs name the same repository?
 *
 * Total by construction: two parsed URLs compare on (host, path), and anything
 * this module could not parse compares on its exact text.
 */
export function sameRepoUrl(a: string, b: string): boolean {
  const left = normalizeRepoUrl(a);
  const right = normalizeRepoUrl(b);
  if (left.kind === "parsed" && right.kind === "parsed") {
    return left.host === right.host && left.path === right.path;
  }
  if (left.kind === "opaque" && right.kind === "opaque") {
    return left.raw === right.raw;
  }
  return false;
}

/**
 * How git would reach this remote: a directory on this machine, or anything
 * else (ssh, http(s), git://, a remote helper's `<transport>::<address>`).
 *
 * git's own rule (`url_is_local_not_ssh` in connect.c), not a guess: a URL
 * with `://` is local only as `file://`; without one, it is local unless a `:`
 * comes before the first `/` — which is scp syntax (`host:path`, dot or not)
 * or a helper's `::` — and a Windows drive letter (`C:\x`, `C:/x`) is local
 * again. Needed because a local remote cannot be probed for write access (see
 * `LocalReason`'s `filesystem-remote`).
 */
export function remoteTransport(raw: string): "filesystem" | "network" {
  const url = raw.trim();
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(url);
  if (scheme)
    return scheme[1]!.toLowerCase() === "file" ? "filesystem" : "network";
  if (/^[a-z]:[\\/]/i.test(url)) return "filesystem";
  const colon = url.indexOf(":");
  if (colon === -1) return "filesystem";
  const slash = url.indexOf("/");
  return slash !== -1 && slash < colon ? "filesystem" : "network";
}

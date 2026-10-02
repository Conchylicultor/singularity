/**
 * What a file viewer shows: one file, named by WHERE its bytes live.
 *
 * - `host` — an absolute path on the user's machine, read through infra/host-fs.
 * - `git` — a path inside a checkout (`worktree` is the namespace the
 *   `/api/code/:worktree/*` routes take), read AS OF `ref` when given, or as it
 *   is on disk right now when not.
 *
 * Renderers receive a `FileRef` and hand it straight to `useFileText` /
 * `fileUrl`; they never branch on `source` to read it.
 */
export type FileRef =
  | { source: "host"; path: string }
  | { source: "git"; worktree: string; ref?: string; path: string };

/**
 * How a file stands against its checkout's base — the context that lights up a
 * contextual renderer (the Diff tab). The same closed set `git status` reports;
 * `clean` and absent both mean "nothing to diff".
 */
export type FileGitStatus =
  | "modified"
  | "added"
  | "deleted"
  | "untracked"
  | "renamed"
  | "copied"
  | "clean";

/** The file's basename. */
export function fileRefName(file: FileRef): string {
  return file.path.slice(file.path.lastIndexOf("/") + 1);
}

/**
 * The file's lower-cased extension without the dot, or `""` when it has none.
 * A leading dot alone (`.gitignore`) is a name, not an extension.
 */
export function fileExtension(path: string): string {
  const base = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  const dot = base.lastIndexOf(".");
  return dot <= 0 ? "" : base.slice(dot + 1);
}

/**
 * One string that identifies the file a ref names — for React keys and for
 * resetting per-file state (the active renderer tab) when the file changes.
 */
export function fileRefKey(file: FileRef): string {
  return file.source === "host"
    ? `host:${file.path}`
    : `git:${file.worktree}:${file.ref ?? ""}:${file.path}`;
}

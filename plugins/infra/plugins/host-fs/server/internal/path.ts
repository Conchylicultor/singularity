import { dirname, isAbsolute, resolve } from "node:path";
import { HttpError } from "@plugins/infra/plugins/endpoints/server";
import { HOME_DIR } from "@plugins/infra/plugins/paths/server";

/** `~` and `~/…` → the user's home. Any other path is returned unchanged. */
export function expandTilde(path: string, home: string = HOME_DIR): string {
  if (path === "~") return home;
  if (path.startsWith("~/")) return resolve(home, path.slice(2));
  return path;
}

/**
 * The absolute host path a request names: `~` expanded, `.`/`..` collapsed,
 * trailing slash dropped. An empty or absent path is the home directory. A
 * relative path or one carrying a NUL byte is a 400 — a host path has no
 * working directory to be relative to.
 */
export function resolveHostPath(
  raw: string | undefined,
  home: string = HOME_DIR,
): string {
  if (raw === undefined || raw === "") return home;
  if (raw.includes("\0")) throw new HttpError(400, "Path contains a NUL byte");
  const expanded = expandTilde(raw, home);
  if (!isAbsolute(expanded)) {
    throw new HttpError(400, `Path must be absolute or start with ~: ${raw}`);
  }
  return resolve(expanded);
}

/** The parent of an absolute path, `null` at the filesystem root. */
export function parentOf(path: string): string | null {
  const parent = dirname(path);
  return parent === path ? null : parent;
}

/** A dotfile: hidden by default, never denied. */
export function isHiddenName(name: string): boolean {
  return name.startsWith(".");
}

/**
 * Classify a filesystem error into the typed failure a host-fs result
 * carries, or rethrow it. `missing` covers ENOENT and ENOTDIR (a component of
 * the path is a file); `denied` covers EACCES and EPERM. Anything else is
 * unexpected and propagates.
 */
export function classifyFsError(err: unknown): "missing" | "denied" {
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  if (code === "ENOENT" || code === "ENOTDIR") return "missing";
  if (code === "EACCES" || code === "EPERM") return "denied";
  throw err;
}

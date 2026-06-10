import { readdir, stat } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { HttpError, implement } from "@plugins/infra/plugins/endpoints/server";
import { HOME_DIR } from "@plugins/infra/plugins/paths/core";
import { browseHostDir } from "../../core";

/** Map a Node fs errno to a loud HTTP error, or rethrow the unexpected. */
function asHttpError(err: unknown, path: string): never {
  const code = (err as NodeJS.ErrnoException).code;
  if (code === "EACCES" || code === "EPERM") {
    throw new HttpError(403, `Permission denied: ${path}`);
  }
  throw err;
}

export const browse = implement(browseHostDir, async ({ query }) => {
  const raw = query.path?.trim();
  const target = raw && raw.length > 0 ? raw : HOME_DIR;

  // A relative path is meaningless for a host picker — reject loudly.
  if (!isAbsolute(target)) {
    throw new HttpError(400, `Path must be absolute: ${target}`);
  }

  const path = resolve(target); // collapse ./ ../, strip trailing slash
  const parent = dirname(path) === path ? null : dirname(path);

  // Stat first so a missing path is a valid "invalid" result, not an error.
  let st;
  try {
    st = await stat(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { path, parent, exists: false, isDirectory: false, entries: [] };
    }
    asHttpError(err, path);
  }

  if (!st.isDirectory()) {
    return { path, parent, exists: true, isDirectory: false, entries: [] };
  }

  let dirents;
  try {
    dirents = await readdir(path, { withFileTypes: true });
  } catch (err) {
    asHttpError(err, path);
  }

  const entries = dirents
    .map((d) => ({ name: d.name, isDirectory: d.isDirectory() }))
    .sort((a, b) =>
      a.isDirectory !== b.isDirectory
        ? a.isDirectory
          ? -1
          : 1
        : a.name.localeCompare(b.name),
    );

  return { path, parent, exists: true, isDirectory: true, entries };
});

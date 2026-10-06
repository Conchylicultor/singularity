import { useMemo } from "react";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { hostFsList } from "@plugins/infra/plugins/host-fs/core";
import { listCodeDir } from "@plugins/code-explorer/plugins/code-api/core";
import {
  fileRefName,
  fileUrl,
  type FileRef,
} from "@plugins/primitives/plugins/file-viewer/core";
import type { ViewerImage } from "@plugins/primitives/plugins/overlay/plugins/image-viewer/web";
import { supportsImage } from "./supports";

/** The folder a file sits in, in the same spelling as the file's path. */
function parentDir(file: FileRef): string {
  const slash = file.path.lastIndexOf("/");
  if (file.source === "host")
    return slash <= 0 ? "/" : file.path.slice(0, slash);
  return slash < 0 ? "" : file.path.slice(0, slash);
}

function siblingRef(file: FileRef, dir: string, name: string): FileRef {
  const path =
    file.source === "host"
      ? `${dir === "/" ? "" : dir}/${name}`
      : dir === ""
        ? name
        : `${dir}/${name}`;
  return { ...file, path };
}

function viewerImage(file: FileRef): ViewerImage {
  return { src: fileUrl(file), name: fileRefName(file) };
}

/**
 * Every image in `file`'s folder, by name — what the viewer steps through
 * with ← / →. Until the folder is listed (or when it cannot be: missing,
 * denied), the set is the file alone; a failed request throws.
 */
export function useFolderImages(file: FileRef): readonly ViewerImage[] {
  const dir = parentDir(file);
  const host = useEndpoint(
    hostFsList,
    {},
    { query: { path: dir }, enabled: file.source === "host" },
  );
  const git = useEndpoint(
    listCodeDir,
    { worktree: file.source === "git" ? file.worktree : "" },
    {
      query:
        file.source === "git" && file.ref !== undefined
          ? { dir, ref: file.ref }
          : { dir },
      enabled: file.source === "git",
    },
  );
  const query = file.source === "host" ? host : git;

  const names = useMemo((): readonly string[] | null => {
    const result = query.data;
    if (result?.kind !== "ok") return null;
    return result.entries
      .filter((e) => e.kind === "file" && supportsImage(e.name) !== false)
      .map((e) => e.name);
  }, [query.data]);

  const images = useMemo(() => {
    const self = fileRefName(file);
    if (names === null || !names.includes(self)) return [viewerImage(file)];
    return names.map((name) => viewerImage(siblingRef(file, dir, name)));
  }, [file, dir, names]);
  if (query.isError) throw query.error;
  return images;
}

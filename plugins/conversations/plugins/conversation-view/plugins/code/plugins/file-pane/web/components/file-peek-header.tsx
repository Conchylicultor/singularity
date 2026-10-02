import { createContext, useContext, type ReactNode } from "react";
import { FilepathBreadcrumb } from "@plugins/primitives/plugins/filepath-breadcrumb/web";
import {
  FileTabs,
  type FileRenderersHandle,
} from "@plugins/primitives/plugins/file-viewer/web";

/**
 * What the file-peek body hands its own header: the path it is showing (the
 * resolved one once resolution settles) and the renderer tabs' state, which is
 * body-local (`useState` in file-viewer's `useFileRenderers`) and shared with the content
 * below. `renderers` is `null` while the path is still resolving or ambiguous —
 * there are no tabs to offer yet.
 */
interface FilePeekHeaderValue {
  path: string;
  renderers: FileRenderersHandle | null;
}

const FilePeekHeaderContext = createContext<FilePeekHeaderValue | null>(null);

export function FilePeekHeaderProvider({
  value,
  children,
}: {
  value: FilePeekHeaderValue;
  children: ReactNode;
}) {
  return (
    <FilePeekHeaderContext.Provider value={value}>
      {children}
    </FilePeekHeaderContext.Provider>
  );
}

function useFilePeekHeader(): FilePeekHeaderValue {
  const value = useContext(FilePeekHeaderContext);
  if (value === null) {
    throw new Error(
      "File-peek header item rendered outside FilePeekHeaderProvider: the " +
        "file-peek body wraps its PaneChrome in the provider, so the header " +
        "items only mount there.",
    );
  }
  return value;
}

/** The file-peek pane's header title: the path as a breadcrumb. */
export function FilePeekTitle() {
  return <FilepathBreadcrumb path={useFilePeekHeader().path} />;
}

/** The renderer tabs (Diff / Raw / Preview …) as a file-peek header item. */
export function FilePeekTabs() {
  const { renderers } = useFilePeekHeader();
  if (renderers === null) return null;
  return <FileTabs {...renderers} />;
}

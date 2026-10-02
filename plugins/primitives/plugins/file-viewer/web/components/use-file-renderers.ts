import { useMemo, useState } from "react";
import type { FileGitStatus, FileRef } from "../../core";
import { FileViewer, resolveRenderers, type ResolvedRenderer } from "../slots";
import { useStableFileRef } from "../internal/use-stable-file-ref";

export interface FileRenderersHandle {
  resolved: ResolvedRenderer[];
  active: ResolvedRenderer | null;
  activeId: string | null;
  setActiveId: (id: string) => void;
}

/**
 * The renderers offered for one file, best tier first, and which one is
 * showing. The selection is local state; a host that splits the tabs (header)
 * from the content (body) reads both halves off this one handle.
 */
export function useFileRenderers({
  file,
  gitStatus,
}: {
  file: FileRef;
  gitStatus?: FileGitStatus;
}): FileRenderersHandle {
  const contributions = FileViewer.Renderer.useContributions();
  const stableFile = useStableFileRef(file);
  const resolved = useMemo(
    () =>
      resolveRenderers(contributions, {
        file: stableFile,
        ...(gitStatus !== undefined ? { gitStatus } : {}),
      }),
    [contributions, stableFile, gitStatus],
  );
  const defaultId = resolved[0]?.contribution.id ?? null;
  const [activeId, setActiveId] = useState<string | null>(defaultId);
  const active =
    resolved.find((r) => r.contribution.id === activeId) ?? resolved[0] ?? null;
  // Stable identity: a host's header reads this through a context value.
  return useMemo(
    () => ({ resolved, active, activeId, setActiveId }),
    [resolved, active, activeId],
  );
}

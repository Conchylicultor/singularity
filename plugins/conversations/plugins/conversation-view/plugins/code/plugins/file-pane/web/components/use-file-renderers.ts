import { useMemo, useState } from "react";
import type { EditedFileStatus } from "@plugins/conversations/plugins/conversation-view/plugins/code/shared";
import {
  FilePane,
  resolveRenderers,
  type ResolvedRenderer,
} from "../slots";

export interface FileRenderersHandle {
  resolved: ResolvedRenderer[];
  active: ResolvedRenderer | null;
  activeId: string | null;
  setActiveId: (id: string) => void;
}

export function useFileRenderers({
  path,
  status,
}: {
  path: string;
  status: EditedFileStatus;
}): FileRenderersHandle {
  const contributions = FilePane.Renderer.useContributions();
  const resolved = useMemo(
    () => resolveRenderers(contributions, { path, status }),
    [contributions, path, status],
  );
  const defaultId = resolved[0]?.contribution.id ?? null;
  const [activeId, setActiveId] = useState<string | null>(defaultId);
  const active =
    resolved.find((r) => r.contribution.id === activeId) ?? resolved[0] ?? null;
  return { resolved, active, activeId, setActiveId };
}

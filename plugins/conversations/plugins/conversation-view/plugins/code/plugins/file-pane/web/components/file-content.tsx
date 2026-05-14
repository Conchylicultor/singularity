import { ContentScope } from "@plugins/primitives/plugins/select-scope/web";
import type { ResolvedRenderer } from "../slots";

export function FileContent({
  worktree,
  path,
  line,
  active,
}: {
  worktree: string;
  path: string;
  line?: number;
  active: ResolvedRenderer | null;
}) {
  if (!active) {
    return (
      <div className="px-3 py-2 text-sm text-muted-foreground">
        No renderer available for this file.
      </div>
    );
  }
  const Component = active.contribution.component;
  return (
    <ContentScope>
      <Component worktree={worktree} path={path} line={line} />
    </ContentScope>
  );
}

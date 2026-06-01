import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import { renderIsolated } from "@plugins/primitives/plugins/slot-render/web";
import { ContentScope } from "@plugins/primitives/plugins/select-scope/web";
import { FilePane, type ResolvedRenderer } from "../slots";

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
  // Bespoke tiered selection (resolveRenderers) can't be expressed via
  // .Render/.Dispatch — render the chosen contribution through renderIsolated so
  // it still routes through the error-boundary middleware chain.
  return (
    <ContentScope>
      {renderIsolated(
        FilePane.Renderer.id,
        active.contribution as unknown as Contribution,
        { worktree, path, line },
      )}
    </ContentScope>
  );
}

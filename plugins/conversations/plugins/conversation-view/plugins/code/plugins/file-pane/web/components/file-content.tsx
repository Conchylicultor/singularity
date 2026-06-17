import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import { renderIsolated } from "@plugins/primitives/plugins/slot-render/web";
import { ContentScope } from "@plugins/primitives/plugins/select-scope/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
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
      <Text as="div" variant="body" className="px-md py-sm text-muted-foreground">
        No renderer available for this file.
      </Text>
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

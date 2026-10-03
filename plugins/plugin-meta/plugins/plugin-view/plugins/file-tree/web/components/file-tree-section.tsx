import type { PluginNode } from "@plugins/plugin-meta/plugins/plugin-view/web";
import { getPluginFacetsTree } from "@plugins/plugin-meta/plugins/plugin-view/core";
import { FileBrowser } from "@plugins/apps/plugins/file-explorer/plugins/browser/web";
import {
  getEndpointErrorMessage,
  useEndpoint,
} from "@plugins/infra/plugins/endpoints/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Clip } from "@plugins/primitives/plugins/css/plugins/clip/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { filePeekPane } from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/web";

// Sentinel resolving to the current running server's own worktree root.
const SELF_WORKTREE = "self";

export function FileTreeSection({ node }: { node: PluginNode }) {
  // The pane that renders this section already holds the tree, so this is a
  // cache hit: it carries the absolute `plugins/` folder the node paths are
  // relative to — this checkout's.
  const tree = useEndpoint(getPluginFacetsTree, {});
  const openPane = useOpenPane();

  if (tree.isError) {
    return <Placeholder>{getEndpointErrorMessage(tree.error)}</Placeholder>;
  }
  if (!tree.data) return <Loading variant="rows" />;
  const { pluginsRoot } = tree.data;
  const pluginDir = `${pluginsRoot}/${node.path}`;

  return (
    <Clip className="h-96 rounded-md border">
      <FileBrowser
        key={pluginDir}
        initialPath={pluginDir}
        root={pluginDir}
        onOpenFile={(path) =>
          openPane(
            filePeekPane,
            {
              worktree: SELF_WORKTREE,
              // Repo-relative: `plugins/` plus the path under it.
              filePath: `plugins/${path.slice(pluginsRoot.length + 1)}`,
            },
            { mode: "push" },
          )
        }
      />
    </Clip>
  );
}

import { useMemo, useState } from "react";
import { Section, type PluginNode } from "@plugins/plugin-meta/plugins/plugin-view/web";
import { FileTree } from "@plugins/code-explorer/web";
import { getCodeTree } from "@plugins/code-explorer/plugins/code-api/core";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { filePeekPane } from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/web";

// Sentinel resolving to the current running server's own worktree root.
const SELF_WORKTREE = "self";

export function FileTreeSection({ node }: { node: PluginNode }) {
  const prefix = `plugins/${node.path}/`;
  const nestedPluginsPrefix = `${prefix}plugins/`;
  const { data } = useEndpoint(getCodeTree, { worktree: SELF_WORKTREE });
  const openPane = useOpenPane();
  const [selected, setSelected] = useState("");

  // The plugin's own files only: under its directory, excluding the nested
  // plugins/ subtree (sub-plugins have their own node + file tree). Strip the
  // prefix so the tree roots at the plugin itself (web/, server/, core/, …).
  const files = useMemo(() => {
    if (!data) return [];
    return data.files
      .filter((f) => f.startsWith(prefix) && !f.startsWith(nestedPluginsPrefix))
      .map((f) => f.slice(prefix.length));
  }, [data, prefix, nestedPluginsPrefix]);

  return (
    <Section title="Files">
      <Scroll axis="both" className="max-h-96 rounded-md border">
        <FileTree
          files={files}
          selectedPath={selected}
          onSelect={(rel) => {
            setSelected(rel);
            openPane(
              filePeekPane,
              { worktree: SELF_WORKTREE, filePath: `${prefix}${rel}` },
              { mode: "push" },
            );
          }}
        />
      </Scroll>
    </Section>
  );
}
